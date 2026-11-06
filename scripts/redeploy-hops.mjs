#!/usr/bin/env node
/**
 * Redeploy hop1–hop4 with allowlists, demo logging, and mix delay.
 *
 * Requires fresh tokens in .keys/railway-tokens.env:
 *   hop1_RAILWAY_API_TOKEN=...
 *   hop2_RAILWAY_API_TOKEN=...
 *   hop3_RAILWAY_API_TOKEN=...
 *   hop4_RAILWAY_API_TOKEN=...
 *
 * Create account tokens at https://railway.com/account/tokens (one per hop account).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  readFileSync(path.join(root, "circuit-registry.json"), "utf8"),
);
const tokens = Object.fromEntries(
  readFileSync(path.join(root, ".keys/railway-tokens.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
const secrets = Object.fromEntries(
  readFileSync(path.join(root, ".keys/hop-secrets.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const hops = [
  { id: "hop1", role: "entry" },
  { id: "hop2", role: "middle" },
  { id: "hop3", role: "exit" },
  { id: "hop4", role: "any" },
];

const allowed = registry.nodes
  .filter((n) => n.url)
  .map((n) => n.url.replace(/\/$/, ""))
  .join(",");
const exitAllow =
  '{"11155111":"https://ethereum-sepolia-rpc.publicnode.com"}';

function sh(token, args, opts = {}) {
  const env = { ...process.env, RAILWAY_TOKEN: token, RAILWAY_API_TOKEN: token };
  console.log(`$ railway ${args.join(" ")}`);
  const res = spawnSync("railway", args, {
    cwd: root,
    encoding: "utf8",
    env,
    ...opts,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0 && !opts.allowFail) {
    throw new Error(`railway failed (${res.status}): ${args.join(" ")}`);
  }
  return res;
}

// Auth check
{
  const t = tokens.hop1_RAILWAY_API_TOKEN;
  if (!t) {
    console.error("Missing hop1_RAILWAY_API_TOKEN in .keys/railway-tokens.env");
    process.exit(1);
  }
  const who = sh(t, ["whoami"], { allowFail: true });
  if (who.status !== 0) {
    console.error(
      "\nRailway tokens look invalid/expired. Create new account tokens and put them in .keys/railway-tokens.env, then re-run:\n  node scripts/redeploy-hops.mjs\n",
    );
    process.exit(1);
  }
}

for (const hop of hops) {
  const token = tokens[`${hop.id}_RAILWAY_API_TOKEN`];
  const meta = JSON.parse(
    readFileSync(path.join(root, `.keys/railway-meta/${hop.id}.json`), "utf8"),
  );
  const priv = secrets[`${hop.id}_RELAY_PRIVATE_KEY`];
  const pub = secrets[`${hop.id}_RELAY_PUBLIC_KEY`];
  if (!token || !priv || !pub) throw new Error(`Missing creds for ${hop.id}`);

  console.log(`\n======== ${hop.id} ========`);
  sh(token, [
    "link",
    "--project",
    meta.projectId,
    "--service",
    meta.serviceId || hop.id,
  ]);

  const pairs = [
    `ROLE=${hop.role}`,
    `RELAY_PRIVATE_KEY=${priv}`,
    `RELAY_PUBLIC_KEY=${pub}`,
    `ALLOWED_HOP_URLS=${allowed}`,
    `EXIT_RPC_ALLOWLIST=${exitAllow}`,
    "DEMO_LOGGING=true",
    "MIX_DELAY_MS_MIN=40",
    "MIX_DELAY_MS_MAX=180",
    "UPSTREAM_TIMEOUT_MS=10000",
    "RATE_LIMIT_PER_MINUTE=60",
    "CIRCUIT_REGISTRY_URL=https://raw.githubusercontent.com/KartikDehru/Relay-mesh/main/circuit-registry.json",
  ];
  sh(token, ["variable", "set", ...pairs]);
  sh(token, ["variable", "delete", "EXIT_RPC_URL"], { allowFail: true });
  sh(token, ["up", "-d", "-y", "-c"]);
  console.log(`✓ ${hop.id} redeploy kicked`);
}

console.log("\nWaiting for health…");
for (const hop of hops) {
  const url = registry.nodes.find((n) => n.id === hop.id)?.url;
  let ok = false;
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        console.log(hop.id, "ok", (await res.json()).fingerprint);
        ok = true;
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (!ok) console.error(hop.id, "FAILED health wait");
}
