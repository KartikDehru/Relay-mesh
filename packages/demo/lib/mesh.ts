import {
  buildOnion,
  generateDemoKey,
  openObservation,
  openReply,
  type HopObservation,
  type RelayHop,
} from "@relay-mesh/crypto";
import type {
  CircuitRegistry,
  HopHealthStatus,
  RegistryNode,
  RpcMethod,
  RpcPayload,
} from "./types";

/** Fixed public sample address for eth_getBalance demos. */
export const SAMPLE_BALANCE_ADDRESS =
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

export async function loadRegistry(): Promise<CircuitRegistry> {
  const res = await fetch("/circuit-registry.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load circuit-registry.json");
  return (await res.json()) as CircuitRegistry;
}

export function deployedNodes(registry: CircuitRegistry): RegistryNode[] {
  return registry.nodes.filter((n) => Boolean(n.url));
}

export function pickFixedCircuit(registry: CircuitRegistry): {
  hops: [RelayHop, RelayHop, RelayHop];
  hopIds: [string, string, string];
  nodes: [RegistryNode, RegistryNode, RegistryNode];
} {
  const map = new Map(registry.nodes.map((n) => [n.id, n]));
  const ids = registry.fixedCircuit as [string, string, string];
  const nodes = ids.map((id) => {
    const n = map.get(id);
    if (!n?.url) throw new Error(`Fixed circuit hop ${id} is not deployed`);
    return n;
  }) as [RegistryNode, RegistryNode, RegistryNode];
  return {
    hopIds: ids,
    nodes,
    hops: nodes.map((n) => ({
      url: n.url.replace(/\/$/, ""),
      publicKey: n.publicKey,
    })) as [RelayHop, RelayHop, RelayHop],
  };
}

export function pickRandomCircuit(registry: CircuitRegistry): {
  hops: [RelayHop, RelayHop, RelayHop];
  hopIds: [string, string, string];
  nodes: [RegistryNode, RegistryNode, RegistryNode];
} {
  const pool = [...deployedNodes(registry)];
  if (pool.length < 3) throw new Error("Need at least 3 deployed hops");
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const nodes = pool.slice(0, 3) as [
    RegistryNode,
    RegistryNode,
    RegistryNode,
  ];
  return {
    hopIds: nodes.map((n) => n.id) as [string, string, string],
    nodes,
    hops: nodes.map((n) => ({
      url: n.url.replace(/\/$/, ""),
      publicKey: n.publicKey,
    })) as [RelayHop, RelayHop, RelayHop],
  };
}

export async function probeHopHealth(
  registry: CircuitRegistry,
): Promise<HopHealthStatus[]> {
  const nodes = deployedNodes(registry);
  return Promise.all(
    nodes.map(async (n) => {
      const role = n.roleHint ?? "hop";
      const base = n.url.replace(/\/$/, "");
      const t0 = performance.now();
      try {
        const res = await fetch(`${base}/health`, { cache: "no-store" });
        const latencyMs = Math.round(performance.now() - t0);
        if (!res.ok) {
          return {
            id: n.id,
            role,
            fingerprint: n.fingerprint,
            url: base,
            ok: false,
            latencyMs,
            error: `HTTP ${res.status}`,
          };
        }
        const body = (await res.json()) as {
          fingerprint?: string;
          role?: string;
        };
        return {
          id: n.id,
          role: body.role ?? role,
          fingerprint: body.fingerprint ?? n.fingerprint,
          url: base,
          ok: true,
          latencyMs,
        };
      } catch (e) {
        return {
          id: n.id,
          role,
          fingerprint: n.fingerprint,
          url: base,
          ok: false,
          latencyMs: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
}

/** Prefer entry hop /whoami (demo mode); never call third-party IP APIs. */
export async function fetchClientIp(entryHopUrl?: string): Promise<string> {
  if (entryHopUrl) {
    try {
      const res = await fetch(`${entryHopUrl.replace(/\/$/, "")}/whoami`);
      if (res.ok) {
        const data = (await res.json()) as { observedIp?: string };
        if (data.observedIp) return data.observedIp;
      }
    } catch {
      /* fall through */
    }
  }
  return "unknown";
}

export function buildRpcPayload(method: RpcMethod): RpcPayload {
  if (method === "eth_getBalance") {
    return {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [SAMPLE_BALANCE_ADDRESS, "latest"],
    };
  }
  if (method === "eth_chainId") {
    return { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
  }
  return { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };
}

export async function sendDirect(
  rpcTargetUrl: string,
  rpcPayload: RpcPayload,
): Promise<{ result: unknown; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(rpcTargetUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rpcPayload),
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - t0);
  let result: unknown = text;
  try {
    result = JSON.parse(text);
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new Error(`Direct RPC HTTP ${res.status}: ${text.slice(0, 200)}`);
  return { result, ms };
}

export async function sendViaMeshBrowser(
  rpcPayload: RpcPayload,
  hops: [RelayHop, RelayHop, RelayHop],
  rpcTargetUrl: string,
): Promise<{
  result: unknown;
  ms: number;
  onion: string;
  observations: HopObservation[];
  legacyHops: boolean;
}> {
  const demoKey = generateDemoKey();
  const { onion, replyKey } = buildOnion(rpcPayload, hops, rpcTargetUrl, {
    demoKey,
  });
  const entryUrl = hops[0].url.replace(/\/$/, "") + "/relay";
  const t0 = performance.now();
  const res = await fetch(entryUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-relay-demo": "1",
    },
    body: JSON.stringify({ payload: onion }),
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Mesh HTTP ${res.status}: ${text.slice(0, 240)}`);

  let wire: {
    payload?: string;
    observations?: string[];
    jsonrpc?: string;
    result?: unknown;
  };
  try {
    wire = JSON.parse(text) as typeof wire;
  } catch {
    throw new Error("Mesh returned non-JSON body");
  }

  // Pre-hardening hops returned plaintext JSON-RPC on the wire.
  if (typeof wire.payload !== "string" && wire.jsonrpc) {
    return {
      result: wire,
      ms,
      onion,
      observations: [],
      legacyHops: true,
    };
  }

  if (typeof wire.payload !== "string") {
    throw new Error("Mesh response missing sealed payload");
  }

  const envelope = openReply(replyKey, wire.payload);
  if (envelope.status < 200 || envelope.status >= 300) {
    throw new Error(
      `Upstream RPC HTTP ${envelope.status}: ${envelope.body.slice(0, 200)}`,
    );
  }
  let result: unknown = envelope.body;
  try {
    result = JSON.parse(envelope.body);
  } catch {
    /* keep text */
  }

  // Exit seals first, then each forward hop appends → [exit, …, entry].
  // Reverse so UI reads hop1 → hop3.
  const sealedList = [...(wire.observations ?? [])].reverse();
  const observations: HopObservation[] = [];
  for (const sealed of sealedList) {
    try {
      observations.push(openObservation(demoKey, sealed));
    } catch {
      /* hop may not have DEMO_LOGGING yet */
    }
  }

  return { result, ms, onion, observations, legacyHops: false };
}

export function cipherPreview(onionB64: string, max = 96): string {
  if (onionB64.length <= max) return onionB64;
  return `${onionB64.slice(0, max / 2)}…${onionB64.slice(-max / 2)}`;
}

export function shortUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
