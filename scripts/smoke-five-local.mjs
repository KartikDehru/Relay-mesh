#!/usr/bin/env node
/**
 * Phase 2 smoke (no Railway required):
 *  - spawn 5 local hops on :4001–:4005 with the real keypairs
 *  - write a temp circuit-registry with those URLs
 *  - buildFixedCircuit(hop1→hop2→hop3) + eth_blockNumber through the mesh
 *
 * Usage: node scripts/smoke-five-local.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secrets = Object.fromEntries(
  readFileSync(path.join(root, ".keys/hop-secrets.env"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const EXIT_RPC_URL =
  secrets.EXIT_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

const hops = [1, 2, 3, 4, 5].map((n) => ({
  id: `hop${n}`,
  port: 4000 + n,
  role: n === 1 ? "entry" : n === 2 ? "middle" : n === 3 ? "exit" : "any",
  privateKey: secrets[`hop${n}_RELAY_PRIVATE_KEY`],
  publicKey: secrets[`hop${n}_RELAY_PUBLIC_KEY`],
}));

const relayEntry = path.join(root, "packages/relay-node/src/index.ts");
const children = [];

function startHop(hop) {
  const proc = spawn("pnpm", ["exec", "tsx", relayEntry], {
    cwd: path.join(root, "packages/relay-node"),
    env: {
      ...process.env,
      ROLE: hop.role,
      PORT: String(hop.port),
      RELAY_PRIVATE_KEY: hop.privateKey,
      RELAY_PUBLIC_KEY: hop.publicKey,
      EXIT_RPC_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout.on("data", (b) => process.stdout.write(`[${hop.id}] ${b}`));
  proc.stderr.on("data", (b) => process.stderr.write(`[${hop.id}:err] ${b}`));
  children.push(proc);
}

async function waitHealth(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`hop :${port} not healthy`);
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

for (const hop of hops) startHop(hop);
await Promise.all(hops.map((h) => waitHealth(h.port)));

const baseRegistry = JSON.parse(
  readFileSync(path.join(root, "circuit-registry.json"), "utf8"),
);
for (const hop of hops) {
  const node = baseRegistry.nodes.find((n) => n.id === hop.id);
  node.url = `http://127.0.0.1:${hop.port}`;
  node.fingerprint = hop.id; // overwritten below from health
  node.publicKey = hop.publicKey;
}
// refresh fingerprints from /health
for (const hop of hops) {
  const health = await (await fetch(`http://127.0.0.1:${hop.port}/health`)).json();
  const node = baseRegistry.nodes.find((n) => n.id === hop.id);
  node.fingerprint = health.fingerprint;
}

const dir = mkdtempSync(path.join(tmpdir(), "relay-mesh-"));
const regPath = path.join(dir, "circuit-registry.json");
writeFileSync(regPath, JSON.stringify(baseRegistry, null, 2));
console.log(`Wrote temp registry → ${regPath}`);

// Dynamic import built client
const clientUrl = pathToFileURL(
  path.join(root, "packages/client/dist/index.js"),
).href;
const {
  loadCircuitRegistry,
  buildFixedCircuit,
  sendViaRelayMesh,
} = await import(clientUrl);

const registry = loadCircuitRegistry(
  JSON.parse(readFileSync(regPath, "utf8")),
);
const { circuit, rpcTargetUrl, hopIds } = buildFixedCircuit(registry);
console.log(`Fixed circuit: ${hopIds.join(" → ")}`);

const result = await sendViaRelayMesh(
  { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
  circuit,
  rpcTargetUrl,
  { timeoutMs: 30_000 },
);

console.log("RPC result:", JSON.stringify(result));
if (!result?.result || !/^0x[0-9a-fA-F]+$/.test(result.result)) {
  shutdown();
  process.exit(1);
}

console.log("✓ Phase 2 fixed-circuit smoke passed (5 local hops, hop1→hop2→hop3)");
shutdown();
process.exit(0);
