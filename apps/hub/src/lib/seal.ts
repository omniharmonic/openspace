/**
 * Sealing owner secrets at rest (sender API keys, a sovereign Stripe key, webhook secrets, the
 * member-token signing key): AES-GCM with TOKEN_ENC_KEY, bound to a purpose string (AAD). In
 * DEV_MODE without a key the value is stored readable (`plain.` prefix) so the product still
 * runs with no secrets; a production Hub without TOKEN_ENC_KEY refuses (503).
 */
import type { HubConfig } from "../env";
import { notConfigured } from "../growth-env";
import { base64ToUtf8, decryptSecret, encryptSecret, utf8ToBase64 } from "./crypto";

export async function sealSecret(config: HubConfig, value: string, aad: string): Promise<string> {
  if (config.tokenEncKey) return encryptSecret(config.tokenEncKey, value, aad);
  if (config.devMode) return `plain.${utf8ToBase64(value)}`;
  throw notConfigured("Secure storage (TOKEN_ENC_KEY)");
}

export async function openSecret(config: HubConfig, sealed: string, aad: string): Promise<string> {
  if (sealed.startsWith("plain.")) {
    // Only ever written in DEV_MODE; never trusted on a production Hub.
    if (!config.devMode) throw notConfigured("Secure storage (TOKEN_ENC_KEY)");
    return base64ToUtf8(sealed.slice(6));
  }
  if (!config.tokenEncKey) throw notConfigured("Secure storage (TOKEN_ENC_KEY)");
  return decryptSecret(config.tokenEncKey, sealed, aad);
}

/** HMAC-SHA256, base64url (truncated to `len` chars). */
export async function hmacB64(key: string, message: string, len = 43): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)),
  );
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, len);
}

/** HMAC-SHA256 as lowercase hex (Stripe, Postmark-style signatures). */
export async function hmacHex(
  key: string | Uint8Array,
  message: string | Uint8Array,
): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      k,
      typeof message === "string" ? enc.encode(message) : message,
    ),
  );
  let out = "";
  for (const b of sig) out += b.toString(16).padStart(2, "0");
  return out;
}
