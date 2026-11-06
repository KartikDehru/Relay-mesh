import type { RelayHop } from "@relay-mesh/crypto";
import type { Circuit } from "./send.js";

export type RegistryNode = {
  id: string;
  fingerprint: string;
  publicKey: string;
  url: string;
  railwayAccount?: string;
  roleHint?: string;
};

export type CircuitRegistry = {
  version: number;
  description?: string;
  claim?: string;
  rpcTargetUrl: string;
  rpcTargetNote?: string;
  fixedCircuit: string[];
  fixedCircuitRoles?: Record<string, string>;
  spareNodes?: string[];
  nodes: RegistryNode[];
};

export function assertDeployed(nodes: RegistryNode[]): void {
  const missing = nodes.filter((n) => !n.url || n.url.includes("PENDING"));
  if (missing.length > 0) {
    throw new Error(
      `Circuit nodes missing public URLs: ${missing.map((n) => n.id).join(", ")}. ` +
        `Deploy each hop to its independent Railway account and update circuit-registry.json.`,
    );
  }
}

export function getNodeMap(registry: CircuitRegistry): Map<string, RegistryNode> {
  return new Map(registry.nodes.map((n) => [n.id, n]));
}

/** Fixed MVP circuit: hop1 → hop2 → hop3 (documented in circuit-registry.json). */
export function buildFixedCircuit(registry: CircuitRegistry): {
  circuit: Circuit;
  rpcTargetUrl: string;
  hopIds: [string, string, string];
} {
  if (registry.fixedCircuit.length !== 3) {
    throw new Error("fixedCircuit must list exactly 3 node ids");
  }
  const map = getNodeMap(registry);
  const hopIds = registry.fixedCircuit as [string, string, string];
  const hops = hopIds.map((id) => {
    const node = map.get(id);
    if (!node) throw new Error(`Unknown node id in fixedCircuit: ${id}`);
    return node;
  });
  assertDeployed(hops);

  const circuit = hops.map(
    (n): RelayHop => ({ url: n.url.replace(/\/$/, ""), publicKey: n.publicKey }),
  ) as Circuit;

  return { circuit, rpcTargetUrl: registry.rpcTargetUrl, hopIds };
}

/**
 * Stretch: randomly pick 3 of N nodes for a request-scoped circuit.
 * Order is shuffled so positions (entry/middle/exit) vary.
 */
export function buildRandomCircuit(
  registry: CircuitRegistry,
  rng: () => number = Math.random,
): {
  circuit: Circuit;
  rpcTargetUrl: string;
  hopIds: [string, string, string];
} {
  const deployed = registry.nodes.filter((n) => n.url && !n.url.includes("PENDING"));
  if (deployed.length < 3) {
    throw new Error(`Need at least 3 deployed nodes; have ${deployed.length}`);
  }
  const pool = [...deployed];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, 3) as [RegistryNode, RegistryNode, RegistryNode];
  const hopIds = picked.map((n) => n.id) as [string, string, string];
  const circuit = picked.map(
    (n): RelayHop => ({ url: n.url.replace(/\/$/, ""), publicKey: n.publicKey }),
  ) as Circuit;
  return { circuit, rpcTargetUrl: registry.rpcTargetUrl, hopIds };
}

export function loadCircuitRegistry(data: unknown): CircuitRegistry {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid circuit registry");
  }
  const reg = data as CircuitRegistry;
  if (!Array.isArray(reg.nodes) || reg.nodes.length < 3) {
    throw new Error("circuit-registry.json must list at least 3 nodes");
  }
  if (!reg.rpcTargetUrl) {
    throw new Error("circuit-registry.json missing rpcTargetUrl");
  }
  return reg;
}
