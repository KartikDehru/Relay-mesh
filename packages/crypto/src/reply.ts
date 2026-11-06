import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  base64ToBytes,
  bytesToBase64,
  concatBytes,
} from "./encoding.js";
import { padBinaryToBucket, stripBinaryPadding } from "./pad.js";

const NONCE_LEN = 24;
const KEY_LEN = 32;

/** Envelope sealed inside the exit→client reply. */
export type ReplyEnvelope = {
  status: number;
  contentType?: string;
  body: string;
};

/**
 * Encrypt a reply envelope with a request-scoped 32-byte replyKey.
 * Wire format (base64): nonce (24) || ciphertext+tag
 */
export function sealReply(replyKeyB64: string, envelope: ReplyEnvelope): string {
  const key = base64ToBytes(replyKeyB64);
  if (key.length !== KEY_LEN) {
    throw new Error(`replyKey must be ${KEY_LEN} bytes`);
  }
  const nonce = randomBytes(NONCE_LEN);
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  // Bucket-pad the sealed bytes so observers cannot infer response size.
  return bytesToBase64(
    padBinaryToBucket(concatBytes(nonce, ciphertext)),
  );
}

/**
 * Decrypt a reply payload produced by sealReply / the exit hop.
 */
export function openReply(replyKeyB64: string, payloadB64: string): ReplyEnvelope {
  const key = base64ToBytes(replyKeyB64);
  if (key.length !== KEY_LEN) {
    throw new Error(`replyKey must be ${KEY_LEN} bytes`);
  }
  const blob = stripBinaryPadding(base64ToBytes(payloadB64));
  if (blob.length < NONCE_LEN + 16) {
    throw new Error("Reply payload too short");
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const ciphertext = blob.subarray(NONCE_LEN);
  const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as ReplyEnvelope;
  if (typeof parsed?.status !== "number" || typeof parsed?.body !== "string") {
    throw new Error("Invalid reply envelope");
  }
  return parsed;
}

/** Generate a fresh 32-byte reply key (base64). */
export function generateReplyKey(): string {
  return bytesToBase64(randomBytes(KEY_LEN));
}

/** Alias — demo observations use the same symmetric seal as replies. */
export const generateDemoKey = generateReplyKey;

export type HopObservation = {
  role: string;
  observedPeerIp: string;
  bytesIn: number;
  payloadSha256Prefix: string;
  layerType: "forward" | "exit";
  sawPlaintextQuery: boolean;
};

export function sealObservation(
  demoKeyB64: string,
  observation: HopObservation,
): string {
  return sealReply(demoKeyB64, {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(observation),
  });
}

export function openObservation(
  demoKeyB64: string,
  sealedB64: string,
): HopObservation {
  const env = openReply(demoKeyB64, sealedB64);
  return JSON.parse(env.body) as HopObservation;
}
