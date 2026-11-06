#!/usr/bin/env node
/**
 * Update a hop's public URL in circuit-registry.json
 * Usage: node scripts/set-registry-url.mjs hop1 https://xxx.up.railway.app
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "circuit-registry.json");
const [hopId, url] = process.argv.slice(2);

if (!hopId || !url) {
  console.error("Usage: node scripts/set-registry-url.mjs <hopId> <url>");
  process.exit(1);
}

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const node = registry.nodes.find((n) => n.id === hopId);
if (!node) {
  console.error(`Unknown hop: ${hopId}`);
  process.exit(1);
}
node.url = url.replace(/\/$/, "");
writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`Updated ${hopId}.url = ${node.url}`);
