import { sealLayer } from "./seal.js";
import { generateReplyKey } from "./reply.js";
import { padJsonObject } from "./pad.js";

/** A relay hop addressable by URL + public key (base64). */
export type RelayHop = {
  url: string;
  publicKey: string;
};

export type BuiltOnion = {
  /** Outer ciphertext (base64) to POST to entry `/relay`. */
  onion: string;
  /** Request-scoped 32-byte key (base64) for decrypting the exit reply. */
  replyKey: string;
  /** Present when buildOnion was called with demoKey (demo capture mode). */
  demoKey?: string;
};

export type BuildOnionOptions = {
  /**
   * When set, included in every layer so DEMO_LOGGING hops can seal
   * per-hop observations only the client can open.
   */
  demoKey?: string;
};

/**
 * Build an N-layer nested onion (N >= 3) for hops[0] → … → hops[N-1] → RPC.
 *
 * Innermost (exit):  { rpcTargetUrl, rpcPayload, replyKey } (bucket-padded)
 * Each prior hop:    { nextHopUrl: next.url, innerBlob }
 *
 * Default production circuit remains 3 hops (entry → middle → exit).
 */
export function buildOnion(
  rpcPayload: unknown,
  hops: readonly RelayHop[],
  rpcTargetUrl: string,
  options: BuildOnionOptions = {},
): BuiltOnion {
  if (hops.length < 3) {
    throw new Error("circuit must contain at least 3 hops");
  }

  const replyKey = generateReplyKey();
  const demoKey = options.demoKey;
  const exit = hops[hops.length - 1]!;

  let blob = sealLayer(
    exit.publicKey,
    padJsonObject({
      rpcTargetUrl,
      rpcPayload,
      replyKey,
      ...(demoKey ? { demoKey } : {}),
    }),
  );

  for (let i = hops.length - 2; i >= 0; i--) {
    const hop = hops[i]!;
    const next = hops[i + 1]!;
    blob = sealLayer(hop.publicKey, {
      nextHopUrl: next.url.replace(/\/$/, ""),
      innerBlob: blob,
      ...(demoKey ? { demoKey } : {}),
    });
  }

  return { onion: blob, replyKey, ...(demoKey ? { demoKey } : {}) };
}
