/** Small Web Crypto helpers (no Node APIs). */

const enc = new TextEncoder();

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(enc.encode(text));
}

export function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? enc.encode(input) : input;
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

export async function sha1Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? enc.encode(input) : input;
  return toHex(await crypto.subtle.digest("SHA-1", data));
}

/** A random URL-safe token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/** Random lowercase id with a prefix, e.g. `usr_k3f9…` (Crockford base32). */
export function randomId(prefix: string, length = 16): string {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += alphabet[b & 31];
  return `${prefix}_${out}`;
}

/** Constant-time string comparison (over SHA-256 digests, so lengths don't leak either). */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb) && a.length === b.length;
}

// --- AES-GCM token encryption (arch §6.1: refresh tokens encrypted at rest) -------------------

async function importAesKey(keyB64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyB64);
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Encrypts to `v1.<iv b64>.<ciphertext b64>`. `aad` binds the ciphertext to e.g. a user id. */
export async function encryptSecret(keyB64: string, plaintext: string, aad = ""): Promise<string> {
  const key = await importAesKey(keyB64);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`;
}

export async function decryptSecret(keyB64: string, sealed: string, aad = ""): Promise<string> {
  const [version, ivB64, ctB64] = sealed.split(".");
  if (version !== "v1" || !ivB64 || !ctB64) throw new Error("Unrecognized encrypted value");
  const key = await importAesKey(keyB64);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64), additionalData: enc.encode(aad) },
    key,
    base64ToBytes(ctB64),
  );
  return new TextDecoder().decode(pt);
}
