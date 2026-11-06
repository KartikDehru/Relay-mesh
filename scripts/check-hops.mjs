#!/usr/bin/env node
/** Hit /health on every node listed in circuit-registry.json */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  readFileSync(path.join(root, "circuit-registry.json"), "utf8"),
);

let ok = 0;
let fail = 0;
let skipped = 0;
for (const node of registry.nodes) {
  if (!node.url) {
    console.log(`SKIP ${node.id} — no url (not deployed yet)`);
    skipped++;
    continue;
  }
  try {
    const res = await fetch(`${node.url.replace(/\/$/, "")}/health`);
    const body = await res.json();
    const match = body.fingerprint === node.fingerprint;
    console.log(
      `${res.ok && match ? "OK  " : "BAD "} ${node.id} ${node.url} role=${body.role} fp=${body.fingerprint}${match ? "" : ` (expected ${node.fingerprint})`}`,
    );
    if (res.ok && match) ok++;
    else fail++;
  } catch (e) {
    console.log(`FAIL ${node.id} ${node.url} — ${e.message}`);
    fail++;
  }
}
console.log(`\n${ok} healthy, ${fail} unhealthy, ${skipped} not deployed`);
process.exit(fail === 0 && ok > 0 ? 0 : 1);
