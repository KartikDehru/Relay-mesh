// Relay Mesh anon-rpc worker (SPEC §3.2).
// Routes every fetch call's JSON-RPC body through the 3-hop onion mesh, then
// returns the upstream RPC response. Ambient `fetch` reaches Railway entry hops
// (CORS enabled). Crypto is bundled via @relay-mesh/crypto.

import { buildOnion, openReply, type RelayHop } from "@relay-mesh/crypto";
import type {
  AnonRpcWorkerApi,
  AnonFetchResponse,
  AnonRequestInit,
  ByteBody,
  HeaderList,
} from "./spec-types.js";
import { DEFAULT_HOPS, DEFAULT_POOL, type Hop } from "./default-circuit.js";

declare const anonRpcWorker: AnonRpcWorkerApi;

type WorkerConfig = {
  hops?: Hop[];
  pool?: Hop[];
  /** When true (default), different isolationKeys shuffle a 3-hop circuit from pool. */
  honorIsolationKey?: boolean;
};

(async () => {
  try {
    // Validate default circuit is reachable enough to serve; soft-fail only if
    // config is explicitly broken.
    const cfg = readConfig();
    if (cfg.hops && cfg.hops.length !== 3) {
      anonRpcWorker.signalFailed({
        code: "relay-mesh/bad-config",
        message: "config.hops must be length 3",
      });
      return;
    }
    anonRpcWorker.signalReady();
  } catch (e) {
    anonRpcWorker.signalFailed({
      code: "relay-mesh/init-failed",
      message: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  for (;;) {
    let call;
    try {
      call = await anonRpcWorker.acceptCall();
    } catch (e) {
      anonRpcWorker.log.error(
        "acceptCall failed:",
        (e as Error)?.message ?? String(e),
      );
      return;
    }
    if (call.kind !== "fetch") continue;
    call.respond(handleFetch(call.url, call.requestInit));
  }
})();

function readConfig(): WorkerConfig {
  const raw = anonRpcWorker.config;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as WorkerConfig;
}

async function handleFetch(
  url: string,
  init?: AnonRequestInit,
): Promise<AnonFetchResponse> {
  const cfg = readConfig();
  const hops = pickCircuit(cfg, init);
  const bodyBytes = init?.body ? await readAll(init.body) : new Uint8Array();
  let rpcPayload: unknown = null;
  if (bodyBytes.length > 0) {
    try {
      rpcPayload = JSON.parse(new TextDecoder().decode(bodyBytes));
    } catch {
      // Non-JSON bodies still go through as opaque payloads.
      rpcPayload = { rawBase64: bytesToBase64(bodyBytes) };
    }
  }

  const { onion, replyKey } = buildOnion(
    rpcPayload,
    hops.map((h) => ({ url: h.url, publicKey: h.publicKey })) as [
      RelayHop,
      RelayHop,
      RelayHop,
    ],
    url,
  );

  const entryUrl = hops[0]!.url.replace(/\/$/, "") + "/relay";
  const resp = await fetch(entryUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: onion }),
  });

  const wireText = await resp.text();
  if (!resp.ok) {
    return {
      status: resp.status,
      headers: [["content-type", "application/json"]],
      body: new TextEncoder().encode(wireText),
      url: resp.url,
    };
  }

  let wire: { payload?: string };
  try {
    wire = JSON.parse(wireText) as { payload?: string };
  } catch {
    return {
      status: 502,
      headers: [["content-type", "text/plain"]],
      body: new TextEncoder().encode("relay mesh returned non-JSON"),
      url: entryUrl,
    };
  }
  if (typeof wire.payload !== "string") {
    return {
      status: 502,
      headers: [["content-type", "text/plain"]],
      body: new TextEncoder().encode("relay mesh missing sealed payload"),
      url: entryUrl,
    };
  }

  const envelope = openReply(replyKey, wire.payload);
  const headers: HeaderList = [];
  if (envelope.contentType) {
    headers.push(["content-type", envelope.contentType]);
  }
  return {
    status: envelope.status,
    headers,
    body: new TextEncoder().encode(envelope.body),
    url,
  };
}

function pickCircuit(cfg: WorkerConfig, init?: AnonRequestInit): [Hop, Hop, Hop] {
  if (cfg.hops && cfg.hops.length === 3) {
    return cfg.hops as [Hop, Hop, Hop];
  }
  const honor = cfg.honorIsolationKey !== false;
  const isolationKey = init?.anonOptions?.isolationKey;
  const pool = (cfg.pool && cfg.pool.length >= 3 ? cfg.pool : DEFAULT_POOL).filter(
    (h) => Boolean(h.url),
  );
  if (honor && isolationKey && pool.length >= 3) {
    return shufflePick3(pool, isolationKey);
  }
  return DEFAULT_HOPS;
}

/** Deterministic shuffle from isolationKey so same key → same circuit. */
function shufflePick3(pool: Hop[], seed: string): [Hop, Hop, Hop] {
  const arr = [...pool];
  let s = hashSeed(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return [arr[0]!, arr[1]!, arr[2]!];
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function readAll(body: ByteBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
