import { sealLayer } from "./seal.js";

/** A relay hop addressable by URL + public key (base64). */
export type RelayHop = {
  url: string;
  publicKey: string;
};

/**
 * Build a 3-layer nested onion for entry → middle → exit → RPC.
 *
 * Innermost (exit):  { rpcTargetUrl, rpcPayload }
 * Middle:            { nextHopUrl: exit.url, innerBlob }
 * Outer (entry):     { nextHopUrl: middle.url, innerBlob }
 *
 * Returns the outer ciphertext (base64) to POST to entry `/relay`.
 */
export function buildOnion(
  rpcPayload: unknown,
  hops: [RelayHop, RelayHop, RelayHop],
  rpcTargetUrl: string,
): string {
  const [entry, middle, exit] = hops;

  const exitLayer = sealLayer(exit.publicKey, {
    rpcTargetUrl,
    rpcPayload,
  });

  const middleLayer = sealLayer(middle.publicKey, {
    nextHopUrl: exit.url,
    innerBlob: exitLayer,
  });

  const entryLayer = sealLayer(entry.publicKey, {
    nextHopUrl: middle.url,
    innerBlob: middleLayer,
  });

  return entryLayer;
}
