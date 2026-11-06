import { buildOnion, openReply, type RelayHop } from "@relay-mesh/crypto";

/**
 * Circuit: three relay hops [entry, middle, exit].
 * `rpcTargetUrl` is the final JSON-RPC endpoint (separate from hop URLs).
 */
export type Circuit = [RelayHop, RelayHop, RelayHop];

export type SendViaRelayMeshOptions = {
  /** Optional fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
  /** Request timeout in ms (best-effort via AbortSignal). */
  timeoutMs?: number;
};

/**
 * Build a nested onion for `circuit` and POST it to the entry hop's `/relay`.
 * Returns the parsed JSON-RPC response body from the target RPC.
 */
export async function sendViaRelayMesh(
  rpcPayload: unknown,
  circuit: Circuit,
  rpcTargetUrl: string,
  options: SendViaRelayMeshOptions = {},
): Promise<unknown> {
  if (circuit.length !== 3) {
    throw new Error("circuit must contain exactly 3 hops: [entry, middle, exit]");
  }

  const { onion, replyKey } = buildOnion(rpcPayload, circuit, rpcTargetUrl);
  const entryUrl = circuit[0].url.replace(/\/$/, "") + "/relay";
  const fetchFn = options.fetch ?? fetch;

  const controller =
    options.timeoutMs != null ? new AbortController() : undefined;
  const timer =
    controller && options.timeoutMs != null
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

  try {
    const res = await fetchFn(entryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: onion }),
      signal: controller?.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Relay mesh HTTP ${res.status}: ${text.slice(0, 400)}`);
    }

    let wire: { payload?: string };
    try {
      wire = JSON.parse(text) as { payload?: string };
    } catch {
      throw new Error("Relay mesh returned non-JSON body");
    }
    if (typeof wire.payload !== "string") {
      throw new Error("Relay mesh response missing sealed payload");
    }

    // Entry/middle observe only ciphertext; client opens with replyKey.
    const envelope = openReply(replyKey, wire.payload);
    if (envelope.status < 200 || envelope.status >= 300) {
      throw new Error(
        `Upstream RPC HTTP ${envelope.status}: ${envelope.body.slice(0, 400)}`,
      );
    }
    try {
      return JSON.parse(envelope.body) as unknown;
    } catch {
      return envelope.body;
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
