import { blake2b } from "blakejs";
import nacl from "tweetnacl";
import { base64ToBytes, bytesToBase64 } from "../lib/crypto";

/**
 * libsodium `crypto_box_seal`, which GitHub requires for Actions secrets:
 * ephemeral X25519 key pair, nonce = BLAKE2b-192(ephemeralPk ‖ recipientPk),
 * output = ephemeralPk ‖ crypto_box(message, nonce, recipientPk, ephemeralSk).
 */
export function sealedBox(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const eph = nacl.box.keyPair.fromSecretKey(seed);
  const nonce = blake2b(concat(eph.publicKey, recipientPublicKey), undefined, 24);
  const boxed = nacl.box(message, nonce, recipientPublicKey, eph.secretKey);
  return concat(eph.publicKey, boxed);
}

export function sealedBoxOpen(
  sealed: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array | null {
  const ephPk = sealed.subarray(0, 32);
  const nonce = blake2b(concat(ephPk, recipientPublicKey), undefined, 24);
  return nacl.box.open(sealed.subarray(32), nonce, ephPk, recipientSecretKey);
}

/** Encrypt a secret value for GitHub's `PUT /actions/secrets/{name}` (base64 in, base64 out). */
export function encryptGitHubSecret(publicKeyB64: string, value: string): string {
  return bytesToBase64(sealedBox(new TextEncoder().encode(value), base64ToBytes(publicKeyB64)));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
