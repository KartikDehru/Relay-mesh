import {
  buildOnion,
  generateDemoKey,
  openObservation,
  openReply,
  type HopObservation,
  type RelayHop,
} from "@relay-mesh/crypto";
import type { CircuitRegistry, RegistryNode, RpcPayload } from "./types";

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

export function defaultRpcPayload(): RpcPayload {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_blockNumber",
    params: [],
  };
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
  let wire: { payload?: string; observations?: string[] };
  try {
    wire = JSON.parse(text) as { payload?: string; observations?: string[] };
  } catch {
    throw new Error("Mesh returned non-JSON body");
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

  const observations: HopObservation[] = [];
  for (const sealed of wire.observations ?? []) {
    try {
      observations.push(openObservation(demoKey, sealed));
    } catch {
      /* hop may not have DEMO_LOGGING=true */
    }
  }

  return { result, ms, onion, observations };
}

export function cipherPreview(onionB64: string, max = 96): string {
  if (onionB64.length <= max) return onionB64;
  return `${onionB64.slice(0, max / 2)}…${onionB64.slice(-max / 2)}`;
}
