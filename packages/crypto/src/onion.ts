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
};

/**
 * Build a 3-layer nested onion for entry → middle → exit → RPC.
 *
 * Innermost (exit):  { rpcTargetUrl, rpcPayload, replyKey }
 * Middle:            { nextHopUrl: exit.url, innerBlob }
 * Outer (entry):     { nextHopUrl: middle.url, innerBlob }
 */
export function buildOnion(
  rpcPayload: unknown,
  hops: [RelayHop, RelayHop, RelayHop],
  rpcTargetUrl: string,
): BuiltOnion {
  const [entry, middle, exit] = hops;
  const replyKey = generateReplyKey();

  // Bucket-pad exit plaintext so ciphertext size does not leak method/params size.
  const exitLayer = sealLayer(
    exit.publicKey,
    padJsonObject({
      rpcTargetUrl,
      rpcPayload,
      replyKey,
    }),
  );

  const middleLayer = sealLayer(middle.publicKey, {
    nextHopUrl: exit.url,
    innerBlob: exitLayer,
  });

  const entryLayer = sealLayer(entry.publicKey, {
    nextHopUrl: middle.url,
    innerBlob: middleLayer,
  });

  return { onion: entryLayer, replyKey };
}
