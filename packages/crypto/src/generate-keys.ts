#!/usr/bin/env node
/**
 * CLI: generate N x25519 keypairs for relay nodes.
 * Prints public keys (safe to commit) and private keys (store as secrets only).
 *
 * Usage: pnpm --filter @relay-mesh/crypto generate-keys [count]
 */
import { generateKeypair, publicKeyFingerprint } from "./keys.js";

const count = Math.max(1, Number(process.argv[2] ?? "5") || 5);

const pairs = Array.from({ length: count }, (_, i) => {
  const kp = generateKeypair();
  return {
    id: `hop${i + 1}`,
    fingerprint: publicKeyFingerprint(kp.publicKey),
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  };
});

console.log("=== PUBLIC (safe for circuit-registry.json) ===");
console.log(
  JSON.stringify(
    pairs.map(({ id, fingerprint, publicKey }) => ({ id, fingerprint, publicKey })),
    null,
    2,
  ),
);
console.log("\n=== PRIVATE (Railway secrets ONLY — do not commit) ===");
for (const p of pairs) {
  console.log(`${p.id}: RELAY_PRIVATE_KEY=${p.privateKey}`);
}
