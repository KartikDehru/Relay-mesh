import { randomBytes } from "@noble/hashes/utils.js";
import { bytesToBase64, base64ToBytes } from "./encoding.js";

/**
 * Fixed ciphertext/plaintext size buckets (bytes).
 *
 * This reduces method/response size leakage from byte counts. It does NOT
 * hide hop position in the circuit — forward layers remain distinguishable
 * by structure and timing.
 */
export const PAD_BUCKETS = [1024, 4096, 16_384, 65_536] as const;

export function nextBucketSize(byteLength: number): number {
  for (const b of PAD_BUCKETS) {
    if (byteLength <= b) return b;
  }
  throw new Error(
    `Payload ${byteLength} bytes exceeds max pad bucket ${PAD_BUCKETS[PAD_BUCKETS.length - 1]}`,
  );
}

function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Add a `_pad` field so JSON.stringify UTF-8 length lands on a bucket.
 * Filler is random so padding is not a static fingerprint.
 */
export function padJsonObject<T extends Record<string, unknown>>(
  obj: T,
): T & { _pad: string } {
  const withEmpty = { ...obj, _pad: "" };
  const emptyLen = utf8Len(JSON.stringify(withEmpty));
  const target = nextBucketSize(emptyLen);
  const need = target - emptyLen;
  // Growing `_pad` from "" to a string of length L adds exactly L UTF-8 bytes
  // for ASCII filler.
  const raw = bytesToBase64(randomBytes(Math.max(1, Math.ceil(need * 0.75))));
  const _pad = (raw + "A".repeat(Math.max(0, need))).slice(0, need);
  const padded = { ...obj, _pad };
  const len = utf8Len(JSON.stringify(padded));
  if (len !== target) {
    // Fallback: adjust by rewriting _pad to exact need based on measured delta
    const delta = target - len;
    const adjusted = (_pad + "B".repeat(Math.max(0, delta))).slice(
      0,
      Math.max(0, _pad.length + delta),
    );
    const again = { ...obj, _pad: adjusted };
    if (utf8Len(JSON.stringify(again)) !== target) {
      throw new Error(`padJsonObject failed to hit bucket ${target} (got ${utf8Len(JSON.stringify(again))})`);
    }
    return again;
  }
  return padded;
}

export function stripJsonPadding<T extends Record<string, unknown>>(
  obj: T & { _pad?: string },
): T {
  const { _pad: _removed, ...rest } = obj;
  return rest as T;
}

/**
 * Length-prefix + random pad binary blob up to the next bucket.
 * Layout: u32le(realLen) || realBytes || randomPad
 */
export function padBinaryToBucket(real: Uint8Array): Uint8Array {
  const header = 4;
  const target = nextBucketSize(header + real.length);
  const out = new Uint8Array(target);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(0, real.length, true);
  out.set(real, 4);
  if (target > header + real.length) {
    out.set(randomBytes(target - header - real.length), header + real.length);
  }
  return out;
}

export function stripBinaryPadding(padded: Uint8Array): Uint8Array {
  if (padded.length < 4) throw new Error("Padded blob too short");
  const view = new DataView(
    padded.buffer,
    padded.byteOffset,
    padded.byteLength,
  );
  const realLen = view.getUint32(0, true);
  if (realLen < 0 || 4 + realLen > padded.length) {
    throw new Error("Invalid pad length");
  }
  return padded.subarray(4, 4 + realLen);
}

/** Helpers for base64 wire payloads. */
export function padPayloadB64(payloadB64: string): string {
  return bytesToBase64(padBinaryToBucket(base64ToBytes(payloadB64)));
}

export function stripPayloadB64(paddedB64: string): string {
  return bytesToBase64(stripBinaryPadding(base64ToBytes(paddedB64)));
}
