import { readFileSync } from "node:fs";
import { keccak_256 } from "@noble/hashes/sha3.js";

const path = process.argv[2] ?? "dist/relay-mesh-worker.js";
const bytes = new Uint8Array(readFileSync(path));
const hash = Buffer.from(keccak_256(bytes)).toString("hex");
console.log(`0x${hash}`);
