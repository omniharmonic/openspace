import { base64ToBytes, base64url } from "../lib/crypto";

/**
 * GitHub App JWT (RS256): `iss` = app id, `iat` backdated 60 s against clock drift, `exp` ≤ 10 min.
 * GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); Web Crypto only imports PKCS#8,
 * so PKCS#1 keys are wrapped in a PKCS#8 envelope first.
 */

function derLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function der(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts);
  return concat(Uint8Array.of(tag), derLength(body.length), body);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** rsaEncryption OID 1.2.840.113549.1.1.1 + NULL params. */
const RSA_ALGORITHM_ID = Uint8Array.of(
  0x30,
  0x0d,
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
  0x05,
  0x00,
);

export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  return der(0x30, Uint8Array.of(0x02, 0x01, 0x00), RSA_ALGORITHM_ID, der(0x04, pkcs1));
}

export function pemToPkcs8(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n").trim();
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bytes = base64ToBytes(body);
  return normalized.includes("BEGIN RSA PRIVATE KEY") ? pkcs1ToPkcs8(bytes) : bytes;
}

export async function importAppKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

const json64 = (v: unknown) => base64url(new TextEncoder().encode(JSON.stringify(v)));

export async function createAppJwt(
  appId: string,
  privateKeyPem: string,
  nowMs = Date.now(),
): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  const header = json64({ alg: "RS256", typ: "JWT" });
  const payload = json64({ iat: now - 60, exp: now + 9 * 60, iss: appId });
  const key = await importAppKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(new Uint8Array(sig))}`;
}
