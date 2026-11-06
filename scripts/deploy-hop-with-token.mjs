#!/usr/bin/env node
/**
 * Deploy one hop using RAILWAY_API_TOKEN already in env.
 * Usage: HOP_ID=hop2 ROLE=middle node scripts/deploy-hop-with-token.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hopId = process.env.HOP_ID;
const role = process.env.ROLE || "any";
if (!hopId) {
  console.error("HOP_ID required");
  process.exit(1);
}
if (!process.env.RAILWAY_API_TOKEN) {
  console.error("RAILWAY_API_TOKEN required");
  process.exit(1);
}
delete process.env.RAILWAY_TOKEN;

function loadEnvFile(p) {
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

const secrets = loadEnvFile(path.join(root, ".keys/hop-secrets.env"));
const priv = secrets[`${hopId}_RELAY_PRIVATE_KEY`];
const pub = secrets[`${hopId}_RELAY_PUBLIC_KEY`];
const exitRpc =
  secrets.EXIT_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
if (!priv || !pub) {
  console.error(`Missing keys for ${hopId}`);
  process.exit(1);
}

function sh(args, opts = {}) {
  console.log(`$ railway ${args.join(" ")}`);
  const res = spawnSync("railway", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    ...opts,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0 && !opts.allowFail) {
    throw new Error(`railway ${args[0]} failed with ${res.status}`);
  }
  return res;
}

const projectName = `relay-mesh-${hopId}`;
const metaDir = path.join(root, ".keys/railway-meta");
mkdirSync(metaDir, { recursive: true });

// Create project
const init = sh(["init", "--name", projectName, "--json"]);
const project = JSON.parse(init.stdout.trim().split("\n").filter(Boolean).at(-1));
console.log("project", project);

// Create service + vars
const add = sh([
  "add",
  "--service",
  hopId,
  "--json",
  "--variables",
  `ROLE=${role}`,
  "--variables",
  `RELAY_PRIVATE_KEY=${priv}`,
  "--variables",
  `RELAY_PUBLIC_KEY=${pub}`,
  "--variables",
  `EXIT_RPC_URL=${exitRpc}`,
  "--variables",
  "DEMO_LOGGING=false",
]);
const service = JSON.parse(add.stdout.trim().split("\n").filter(Boolean).at(-1));
console.log("service", service);

sh(["service", "link", hopId]);
sh(["up", "-d", "-y", "-c"]);

const domainRes = sh(["domain", "--json"]);
const domainLines = (domainRes.stdout || "")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);
let url = "";
for (const line of domainLines) {
  try {
    const parsed = JSON.parse(line);
    if (typeof parsed?.domain === "string") {
      url = parsed.domain;
      break;
    }
  } catch {
    /* try next / multiline */
  }
}
if (!url) {
  const blob = domainLines.join("\n");
  try {
    const parsed = JSON.parse(blob);
    if (typeof parsed?.domain === "string") url = parsed.domain;
  } catch {
    const m = blob.match(/https:\/\/[^\s"']+/);
    if (m) url = m[0];
  }
}
if (!url) throw new Error(`Could not parse domain from: ${domainRes.stdout}`);
url = url.replace(/\/$/, "");
console.log("domain", url);

// Wait for health
let healthy = null;
for (let i = 0; i < 60; i++) {
  const st = sh(["service", "status"], { allowFail: true });
  const statusLine = (st.stdout || "").split("\n").find((l) => l.startsWith("Status:"));
  console.log(`[${i}] ${statusLine || "unknown"}`);
  try {
    const res = await fetch(`${url}/health`);
    if (res.ok) {
      healthy = await res.json();
      break;
    }
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, 8000));
}

if (!healthy) {
  console.error("Timed out waiting for health");
  process.exit(1);
}
console.log("health", healthy);

const meta = {
  hopId,
  role,
  projectId: project.id,
  projectName: project.name,
  serviceId: service.id,
  url,
  fingerprint: healthy.fingerprint,
  publicKey: healthy.publicKey,
};
writeFileSync(path.join(metaDir, `${hopId}.json`), JSON.stringify(meta, null, 2));

// Update circuit-registry.json
const registryPath = path.join(root, "circuit-registry.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const node = registry.nodes.find((n) => n.id === hopId);
if (node) {
  node.url = url;
  if (healthy.fingerprint) node.fingerprint = healthy.fingerprint;
  if (healthy.publicKey) node.publicKey = healthy.publicKey;
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
}

console.log(`✓ ${hopId} deployed at ${url}`);
