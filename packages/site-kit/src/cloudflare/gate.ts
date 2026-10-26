/**
 * Gating primitives for the Cloudflare target (arch §9.4): verifying the Hub's magic-link
 * token against its published JWKS, the site's own signed member-session cookie, and shared
 * page passwords stored only as PBKDF2 hashes in the Worker's environment. WebCrypto only, so
 * it runs in Workers and Node alike. No passwords or member lists ever live in content.
 */

const enc = new TextEncoder();

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;

export interface Jwk extends JsonWebKey {
  kid?: string;
  alg?: string;
}

export interface HubClaims {
  /** Member id (Hub subscriber/member). */
  sub: string;
  /** Site id the token is for. */
  aud: string;
  iss: string;
  exp: number;
  iat?: number;
  email?: string;
  /** Member tier (paid tiers map from Stripe subscriptions). */
  tier?: string;
}

export class GateError extends Error {
  override name = "GateError";
}

const ALGS: Record<string, { import: RsaHashedImportParams | EcKeyImportParams; verify: AlgorithmIdentifier | EcdsaParams }> = {
  RS256: { import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
  ES256: { import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
};

/**
 * Verify a Hub-signed JWT (RS256 or ES256) against the Hub's JWKS: signature, `aud` = this
 * site, `iss` = the Hub, and expiry (with 60 s leeway).
 */
export async function verifyHubToken(
  token: string,
  jwks: { keys: Jwk[] },
  expect: { issuer: string; audience: string; now?: number },
): Promise<HubClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new GateError("Malformed token");
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = json(b64urlDecode(h));
    claims = json(b64urlDecode(p));
  } catch {
    throw new GateError("Malformed token");
  }
  const alg = String(header.alg);
  const spec = ALGS[alg];
  if (!spec) throw new GateError(`Unsupported algorithm ${alg}`);
  const jwk = jwks.keys.find((k) => (header.kid ? k.kid === header.kid : true) && (!k.alg || k.alg === alg));
  if (!jwk) throw new GateError("Unknown signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, spec.import, false, ["verify"]);
  const ok = await crypto.subtle.verify(spec.verify, key, b64urlDecode(s), enc.encode(`${h}.${p}`));
  if (!ok) throw new GateError("Bad signature");
  const now = Math.floor((expect.now ?? Date.now()) / 1000);
  if (typeof claims.exp !== "number" || claims.exp + 60 < now) throw new GateError("Token expired");
  if (claims.iss !== expect.issuer) throw new GateError("Wrong issuer");
  const aud = claims.aud;
  if (!(aud === expect.audience || (Array.isArray(aud) && aud.includes(expect.audience))))
    throw new GateError("Token is for another site");
  if (typeof claims.sub !== "string") throw new GateError("Token has no subject");
  return claims as unknown as HubClaims;
}

// --- signed cookies -----------------------------------------------------------------------------

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** `payload.signature` (both base64url) with an expiry inside the payload. */
export async function signValue(value: Record<string, unknown>, secret: string, ttlSeconds: number, now = Date.now()): Promise<string> {
  if (!secret || secret.length < 32) throw new GateError("Session secret must be at least 32 characters");
  const payload = b64urlEncode(enc.encode(JSON.stringify({ ...value, exp: Math.floor(now / 1000) + ttlSeconds })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

export async function readSigned(token: string | undefined, secret: string, now = Date.now()): Promise<Record<string, unknown> | undefined> {
  if (!token || !secret) return undefined;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return undefined;
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64urlDecode(sig), enc.encode(payload));
  } catch {
    return undefined;
  }
  if (!ok) return undefined;
  const value = json(b64urlDecode(payload));
  if (typeof value.exp !== "number" || value.exp < Math.floor(now / 1000)) return undefined;
  return value;
}

export function getCookie(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function setCookie(name: string, value: string, opts: { maxAge: number; path?: string }): string {
  return `${name}=${encodeURIComponent(value)}; Path=${opts.path ?? "/"}; Max-Age=${opts.maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export const MEMBER_COOKIE = "os_member";
export const PASSWORD_COOKIE = "os_pw";
export const SESSION_TTL = 60 * 60 * 24 * 30;

// --- page passwords -----------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;

/** `pbkdf2$<iterations>$<salt>$<hash>` — what Studio stores in the Worker env, never content. */
export async function hashPagePassword(password: string, salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)), iterations = PBKDF2_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64urlEncode(salt)}$${b64urlEncode(bits)}`;
}

export async function checkPagePassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const candidate = await hashPagePassword(password, b64urlDecode(salt), Number(iter));
  const a = enc.encode(candidate);
  const b = enc.encode(stored);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeReturnPath(value: string | null | undefined, basePath: string): string {
  const fallback = `${basePath}/`;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
