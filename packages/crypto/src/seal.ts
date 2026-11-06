import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  base64ToBytes,
  bytesToBase64,
  concatBytes,
} from "./encoding.js";
import { decodePrivateKey, decodePublicKey } from "./keys.js";

const EPHEMERAL_PUB_LEN = 32;
const NONCE_LEN = 24;
const KEY_LEN = 32;

/**
 * Sealed-box wire format (base64 of):
 *   ephemeralPublicKey (32) || nonce (24) || ciphertext+tag
 *
 * Ephemeral x25519 ECDH → HKDF-SHA256 → XChaCha20-Poly1305.
 */

function deriveKey(sharedSecret: Uint8Array): Uint8Array {
  // X25519 shared secrets are not uniform; HKDF before AEAD key use.
  return hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode("relay-mesh/v1"), KEY_LEN);
}

/**
 * Encrypt `plaintextObj` to `publicKey` (base64). Returns base64 ciphertext.
 */
export function sealLayer(publicKey: string, plaintextObj: unknown): string {
  const recipientPub = decodePublicKey(publicKey);
  const ephemeralPriv = x25519.utils.randomPrivateKey();
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
  const shared = x25519.getSharedSecret(ephemeralPriv, recipientPub);
  const key = deriveKey(shared);
  const nonce = randomBytes(NONCE_LEN);
  const plaintext = new TextEncoder().encode(JSON.stringify(plaintextObj));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return bytesToBase64(concatBytes(ephemeralPub, nonce, ciphertext));
}

/**
 * Decrypt a sealed layer with `privateKey` (base64). Returns the parsed object.
 */
export function openLayer<T = unknown>(privateKey: string, ciphertextB64: string): T {
  const blob = base64ToBytes(ciphertextB64);
  if (blob.length < EPHEMERAL_PUB_LEN + NONCE_LEN + 16) {
    throw new Error("Ciphertext too short");
  }
  const ephemeralPub = blob.subarray(0, EPHEMERAL_PUB_LEN);
  const nonce = blob.subarray(EPHEMERAL_PUB_LEN, EPHEMERAL_PUB_LEN + NONCE_LEN);
  const ciphertext = blob.subarray(EPHEMERAL_PUB_LEN + NONCE_LEN);

  const priv = decodePrivateKey(privateKey);
  const shared = x25519.getSharedSecret(priv, ephemeralPub);
  const key = deriveKey(shared);
  const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
