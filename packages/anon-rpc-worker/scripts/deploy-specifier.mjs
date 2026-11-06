#!/usr/bin/env node
/**
 * Deploy WorkerSpecifier.sol pinning the built worker hash + resolver URLs.
 *
 * Env:
 *   RPC_URL       — chain RPC (default: Sepolia publicnode)
 *   PRIVATE_KEY   — deployer key with gas (0x-prefixed)
 *   RESOLVER_URLS — comma-separated https resolvers (or dist/publish-meta.json)
 *   WORKER_HASH   — 0x… keccak256 (or dist/worker-meta.json)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specifierDir = path.join(pkg, "specifier");
const metaPath = path.join(pkg, "dist/worker-meta.json");
const publishMetaPath = path.join(pkg, "dist/publish-meta.json");

if (!existsSync(metaPath)) {
  console.error("Missing dist/worker-meta.json — build first");
  process.exit(1);
}

const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const publishMeta = existsSync(publishMetaPath)
  ? JSON.parse(readFileSync(publishMetaPath, "utf8"))
  : null;

const workerHash = process.env.WORKER_HASH ?? meta.keccak256;
const resolvers =
  process.env.RESOLVER_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ??
  publishMeta?.resolvers ??
  [];
if (resolvers.length === 0) {
  console.error("No RESOLVER_URLS — publish the bundle first or set env");
  process.exit(1);
}

const rpcUrl =
  process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const pk = process.env.PRIVATE_KEY;
if (!pk) {
  console.error("PRIVATE_KEY required");
  process.exit(1);
}

const bundle = readFileSync(path.join(pkg, "dist/relay-mesh-worker.js"));
for (const url of resolvers) {
  console.log(`Verifying resolver ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Resolver HTTP ${res.status}: ${url}`);
  const remote = Buffer.from(await res.arrayBuffer());
  if (!remote.equals(bundle)) {
    throw new Error(`Resolver bytes mismatch: ${url}`);
  }
  console.log("  ok");
}

console.log(`Deploying WorkerSpecifier hash=${workerHash}`);
console.log(`Resolvers: ${JSON.stringify(resolvers)}`);

const enc = spawnSync(
  "cast",
  [
    "abi-encode",
    "constructor(bytes32,string[])",
    workerHash,
    JSON.stringify(resolvers),
  ],
  { encoding: "utf8" },
);
if (enc.status !== 0) {
  process.stderr.write(enc.stderr || "");
  process.exit(1);
}
const encodedArgs = enc.stdout.trim();

const bytecode = spawnSync(
  "forge",
  ["inspect", "src/WorkerSpecifier.sol:WorkerSpecifier", "bytecode"],
  { cwd: specifierDir, encoding: "utf8" },
);
if (bytecode.status !== 0) {
  process.stderr.write(bytecode.stderr || "");
  process.exit(1);
}
const creation =
  bytecode.stdout.trim().replace(/^0x/, "") +
  encodedArgs.replace(/^0x/, "");

const sent = spawnSync(
  "cast",
  [
    "send",
    "--rpc-url",
    rpcUrl,
    "--private-key",
    pk,
    "--create",
    `0x${creation}`,
    "--json",
  ],
  { encoding: "utf8" },
);
process.stdout.write(sent.stdout || "");
process.stderr.write(sent.stderr || "");
if (sent.status !== 0) process.exit(1);

let address;
try {
  const receipt = JSON.parse(sent.stdout);
  address = receipt.contractAddress;
  if (!address && Array.isArray(receipt.logs) && receipt.logs[0]?.address) {
    address = receipt.logs[0].address;
  }
} catch {
  /* fall through */
}
if (!address) {
  const m = sent.stdout.match(/contractAddress["\s:]+(0x[a-fA-F0-9]{40})/i);
  address = m?.[1];
}
if (!address) {
  console.error("Could not parse deployed address");
  process.exit(1);
}
console.log(`Deployed to: ${address}`);

const hashOnChain = spawnSync(
  "cast",
  ["call", address, "workerHash()(bytes32)", "--rpc-url", rpcUrl],
  { encoding: "utf8" },
).stdout.trim();
console.log(`on-chain workerHash: ${hashOnChain}`);

const out = {
  chainRpc: rpcUrl,
  chain: rpcUrl.includes("sepolia") ? "sepolia" : "unknown",
  specifierAddress: address,
  workerHash,
  resolvers,
  deployedAt: new Date().toISOString(),
};
mkdirSync(path.join(pkg, "dist"), { recursive: true });
writeFileSync(
  path.join(pkg, "dist/specifier.json"),
  JSON.stringify(out, null, 2) + "\n",
);
writeFileSync(
  path.join(pkg, "SPECIFIER.json"),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(JSON.stringify(out, null, 2));
