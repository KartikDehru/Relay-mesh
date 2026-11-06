// Bundles the worker to a single standalone IIFE.
// keccak256 of dist/relay-mesh-worker.js is what the specifier pins.

import { build } from "esbuild";
import { rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/relay-mesh-worker.ts"],
  outfile: "dist/relay-mesh-worker.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  logLevel: "info",
  minify: false,
  legalComments: "none",
});

const bytes = new Uint8Array(readFileSync("dist/relay-mesh-worker.js"));
const hashHex = Buffer.from(keccak_256(bytes)).toString("hex");
const meta = {
  file: "dist/relay-mesh-worker.js",
  bytes: bytes.length,
  keccak256: `0x${hashHex}`,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  builtAt: new Date().toISOString(),
};
await writeFile("dist/worker-meta.json", JSON.stringify(meta, null, 2) + "\n");
console.log("build complete");
console.log(JSON.stringify(meta, null, 2));
