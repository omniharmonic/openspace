/**
 * GitHub Actions OIDC tokens (the publish workflow's identity): a run asks GitHub for a JWT with
 * the Hub as audience (`id-token: write`), and the Hub verifies it against GitHub's published
 * keys. The token lives minutes, names the repository, ref and commit of that very run, and needs
 * no stored secret — this is how a Cloudflare publish authorizes downloading its gated content.
 */

import type { FetchLike } from "../github/http";
import { base64ToBytes } from "../lib/crypto";

export const ACTIONS_OIDC_ISSUER = "https://token.actions.githubusercontent.com";

export interface ActionsClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  /** `owner/name` of the repository the run belongs to. */
  repository: string;
  /** `refs/heads/main` etc. */
  ref: string;
  /** The commit the run checked out. */
  sha: string;
  /** `owner/name/.github/workflows/publish.yml@refs/heads/main`. */
  workflow_ref: string;
  /** GitHub's numeric ids (strings in the token). */
  repository_id: string;
  repository_owner_id?: string;
  [claim: string]: unknown;
}

export class OidcError extends Error {
  override name = "OidcError";
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

const b64u = (s: string) => base64ToBytes(s.replace(/-/g, "+").replace(/_/g, "/"));
const decodeJson = (s: string) =>
  JSON.parse(new TextDecoder().decode(b64u(s))) as Record<string, unknown>;

let cache: { at: number; keys: Jwk[] } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;
/** Forced refreshes (an unknown `kid`) at most this often: junk tokens can't hammer GitHub. */
export const JWKS_REFRESH_MIN_MS = 60 * 1000;
let lastForced = Number.NEGATIVE_INFINITY;

async function githubKeys(fetchFn: FetchLike, now: number, refresh = false): Promise<Jwk[]> {
  if (refresh) {
    if (now - lastForced < JWKS_REFRESH_MIN_MS && cache) return cache.keys;
    lastForced = now;
  }
  if (!refresh && cache && now - cache.at < JWKS_TTL_MS) return cache.keys;
  let body: { keys?: Jwk[] };
  try {
    const res = await fetchFn(`${ACTIONS_OIDC_ISSUER}/.well-known/jwks`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new OidcError(`GitHub OIDC keys unavailable (${res.status})`);
    body = (await res.json()) as { keys?: Jwk[] };
  } catch (err) {
    if (err instanceof OidcError) throw err;
    throw new OidcError("GitHub OIDC keys unavailable");
  }
  if (!Array.isArray(body.keys)) throw new OidcError("GitHub OIDC keys malformed");
  cache = { at: now, keys: body.keys };
  return body.keys;
}

/** Test hook: forget cached keys. */
export function resetActionsKeyCache(): void {
  cache = null;
  lastForced = Number.NEGATIVE_INFINITY;
}

/** Verify an Actions OIDC token (RS256) for `audience`; throws `OidcError` when it isn't valid. */
export async function verifyActionsToken(
  token: string,
  opts: { audience: string; fetch: FetchLike; now: number },
): Promise<ActionsClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new OidcError("Malformed token");
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJson(h);
    claims = decodeJson(p);
  } catch {
    throw new OidcError("Malformed token");
  }
  if (header.alg !== "RS256") throw new OidcError("Unsupported algorithm");
  const find = (keys: Jwk[]) => keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  let jwk = find(await githubKeys(opts.fetch, opts.now));
  if (!jwk) jwk = find(await githubKeys(opts.fetch, opts.now, true));
  if (!jwk) throw new OidcError("Unknown signing key");
  let ok = false;
  try {
    if (typeof jwk.n !== "string" || typeof jwk.e !== "string") throw new Error("bad key");
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64u(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
  } catch {
    // A malformed key or signature is an invalid token, never a server error.
    throw new OidcError("Unverifiable token");
  }
  if (!ok) throw new OidcError("Bad signature");
  const now = Math.floor(opts.now / 1000);
  if (claims.iss !== ACTIONS_OIDC_ISSUER) throw new OidcError("Wrong issuer");
  const aud = claims.aud;
  if (!(aud === opts.audience || (Array.isArray(aud) && aud.includes(opts.audience))))
    throw new OidcError("Wrong audience");
  if (typeof claims.exp !== "number" || claims.exp + 30 < now) throw new OidcError("Expired");
  if (typeof claims.nbf === "number" && claims.nbf - 30 > now) throw new OidcError("Not yet valid");
  for (const k of ["repository", "ref", "sha", "workflow_ref", "repository_id"] as const)
    if (typeof claims[k] !== "string") throw new OidcError(`Token has no ${k}`);
  return claims as ActionsClaims;
}
