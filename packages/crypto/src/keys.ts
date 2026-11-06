import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToBase64, base64ToBytes } from "./encoding.js";

export type Keypair = {
  /** Base64-encoded 32-byte x25519 public key */
  publicKey: string;
  /** Base64-encoded 32-byte x25519 private key */
  privateKey: string;
};

/** Generate a fresh x25519 keypair (base64-encoded). */
export function generateKeypair(): Keypair {
  const privateKeyBytes = x25519.utils.randomPrivateKey();
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);
  return {
    publicKey: bytesToBase64(publicKeyBytes),
    privateKey: bytesToBase64(privateKeyBytes),
  };
}

export function decodePublicKey(publicKeyB64: string): Uint8Array {
  const bytes = base64ToBytes(publicKeyB64);
  if (bytes.length !== 32) {
    throw new Error(`Invalid public key length: expected 32, got ${bytes.length}`);
  }
  return bytes;
}

export function decodePrivateKey(privateKeyB64: string): Uint8Array {
  const bytes = base64ToBytes(privateKeyB64);
  if (bytes.length !== 32) {
    throw new Error(`Invalid private key length: expected 32, got ${bytes.length}`);
  }
  return bytes;
}

/** Derive the base64 public key from a base64 private key. */
export function publicKeyFromPrivate(privateKeyB64: string): string {
  const pub = x25519.getPublicKey(decodePrivateKey(privateKeyB64));
  return bytesToBase64(pub);
}

/** Short fingerprint for health checks / logs (first 8 hex of SHA-256 of pubkey). */
export function publicKeyFingerprint(publicKeyB64: string): string {
  const digest = sha256(decodePublicKey(publicKeyB64));
  return Array.from(digest.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
