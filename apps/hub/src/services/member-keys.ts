/**
 * Hub signing keys for member tokens (arch §9.4): ES256 (ECDSA P-256), published as a JWKS at
 * `/.well-known/jwks.json`. A site Worker (site-kit `verifyHubToken`) checks `alg`, `kid`,
 * `iss` = the Hub origin, `aud` = its site id and `exp`.
 *
 * The key is either `MEMBER_JWT_PRIVATE_KEY` (a private JWK) or generated once and stored in
 * D1 sealed with TOKEN_ENC_KEY. Creation is race-safe: the INSERT only happens when no active key
 * exists, and everyone then reads the single active row.
 */
import { base64url, randomId, sha256Hex } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { openSecret, sealSecret } from "../lib/seal";
import type { Services } from "./index";

export interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg: "ES256";
  use: "sig";
}

interface SigningKey {
  kid: string;
  key: CryptoKey;
}

/** Retired keys stay in the JWKS this long so tokens signed just before a rotation verify. */
const RETIRED_GRACE_MS = 24 * 60 * 60 * 1000;
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;

const enc = new TextEncoder();
const b64json = (v: unknown) => base64url(enc.encode(JSON.stringify(v)));

/** RFC 7638 thumbprint (truncated) as the key id. */
async function thumbprint(jwk: JsonWebKey): Promise<string> {
  const canon = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const hex = await sha256Hex(canon);
  const bytes = new Uint8Array(hex.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? []);
  return base64url(bytes).slice(0, 22);
}

function publicJwk(jwk: JsonWebKey, kid: string): PublicJwk {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y)
    throw new Error("Member signing key must be an EC P-256 JWK");
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid, alg: "ES256", use: "sig" };
}

async function envKey(services: Services): Promise<{ signing: SigningKey; pub: PublicJwk } | null> {
  const raw = services.growth.config.memberJwtKey;
  if (!raw) return null;
  const jwk = JSON.parse(raw) as JsonWebKey & { kid?: string };
  const kid = jwk.kid ?? (await thumbprint(jwk));
  const {
    kid: _k,
    alg: _a,
    use: _u,
    key_ops: _o,
    ...material
  } = jwk as JsonWebKey & {
    kid?: string;
    use?: string;
  };
  const key = await crypto.subtle.importKey("jwk", material, ALG, false, ["sign"]);
  return { signing: { kid, key }, pub: publicJwk(jwk, kid) };
}

interface KeyRow {
  kid: string;
  public_jwk: string;
  private_jwk: string;
  created_at: number;
  retired_at: number | null;
}

async function activeRow(db: D1Database): Promise<KeyRow | null> {
  return db
    .prepare(
      "SELECT * FROM hub_keys WHERE alg = 'ES256' AND retired_at IS NULL ORDER BY created_at, kid LIMIT 1",
    )
    .first<KeyRow>();
}

/** Generate and store a key unless one is already active; returns the active row. */
async function ensureRow(services: Services): Promise<KeyRow> {
  const existing = await activeRow(services.db);
  if (existing) return existing;
  const pair = (await crypto.subtle.generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const priv = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  const kid = await thumbprint(priv);
  const sealed = await sealSecret(services.config, JSON.stringify(priv), `member-key:${kid}`);
  await services.db
    .prepare(
      `INSERT INTO hub_keys (kid, alg, public_jwk, private_jwk, created_at)
       SELECT ?, 'ES256', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM hub_keys WHERE alg = 'ES256' AND retired_at IS NULL)`,
    )
    .bind(kid, JSON.stringify(publicJwk(priv, kid)), sealed, services.now())
    .run();
  const row = await activeRow(services.db);
  if (!row) throw new HttpError(500, "internal", "Couldn't create a signing key.");
  return row;
}

async function signingKey(services: Services): Promise<SigningKey> {
  const fromEnv = await envKey(services);
  if (fromEnv) return fromEnv.signing;
  const row = await ensureRow(services);
  const jwk = JSON.parse(
    await openSecret(services.config, row.private_jwk, `member-key:${row.kid}`),
  ) as JsonWebKey;
  const { key_ops: _o, ext: _e, ...material } = jwk;
  return {
    kid: row.kid,
    key: await crypto.subtle.importKey("jwk", material, ALG, false, ["sign"]),
  };
}

/** The published JWKS (active key plus keys retired within the grace period). */
export async function jwks(services: Services): Promise<{ keys: PublicJwk[] }> {
  const fromEnv = await envKey(services);
  const keys: PublicJwk[] = fromEnv ? [fromEnv.pub] : [];
  if (!fromEnv) await ensureRow(services);
  const rows = await services.db
    .prepare(
      "SELECT public_jwk FROM hub_keys WHERE alg = 'ES256' AND (retired_at IS NULL OR retired_at > ?) ORDER BY created_at",
    )
    .bind(services.now() - RETIRED_GRACE_MS)
    .all<{ public_jwk: string }>();
  for (const r of rows.results) {
    const k = JSON.parse(r.public_jwk) as PublicJwk;
    if (!keys.some((x) => x.kid === k.kid)) keys.push(k);
  }
  return { keys };
}

/** Retire the active stored key; the next signature generates a new one. */
export async function rotateMemberKey(services: Services): Promise<void> {
  await services.db
    .prepare("UPDATE hub_keys SET retired_at = ? WHERE alg = 'ES256' AND retired_at IS NULL")
    .bind(services.now())
    .run();
}

/** Sign a compact JWS (ES256; Web Crypto returns the raw r‖s signature JWS needs). */
export async function signJwt(
  services: Services,
  claims: Record<string, unknown>,
): Promise<string> {
  const { kid, key } = await signingKey(services);
  const input = `${b64json({ alg: "ES256", typ: "JWT", kid })}.${b64json(claims)}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  return `${input}.${base64url(new Uint8Array(sig))}`;
}

/** Verify a token this Hub signed (dev preview's own callback). Returns claims or null. */
export async function verifyJwt(
  services: Services,
  token: string,
  expect: { audience: string },
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const dec = (x: string) => {
    const b64 = x.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  };
  try {
    const header = JSON.parse(new TextDecoder().decode(dec(h))) as { alg?: string; kid?: string };
    if (header.alg !== "ES256") return null;
    const jwk = (await jwks(services)).keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      ALG,
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      dec(s),
      enc.encode(`${h}.${p}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(dec(p))) as Record<string, unknown>;
    const now = Math.floor(services.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp < now) return null;
    if (claims.iss !== hubIssuer(services)) return null;
    if (claims.aud !== expect.audience) return null;
    return claims;
  } catch {
    return null;
  }
}

/** `iss` of member tokens: the Hub's origin (what site-kit compares with `new URL(hub).origin`). */
export function hubIssuer(services: Services): string {
  return new URL(services.config.hubUrl).origin;
}

export const newJti = () => randomId("jti", 16);
