import type { SealedSecret } from "../../api";

/**
 * Seal a secret for GitHub Actions in the browser (arch §7.2): a libsodium sealed box made with
 * the site's Actions public key. Only GitHub can open it; the Hub relays ciphertext and never
 * sees the value.
 */
export async function sealSecret(publicKeyB64: string, value: string): Promise<string> {
  const { default: sodium } = await import("libsodium-wrappers");
  await sodium.ready;
  const key = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  if (key.length !== sodium.crypto_box_PUBLICKEYBYTES)
    throw new Error("The encryption key is not valid.");
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), key);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}

export async function sealSecrets(
  key: { keyId: string; key: string },
  values: Record<string, string>,
): Promise<SealedSecret[]> {
  const out: SealedSecret[] = [];
  for (const [name, value] of Object.entries(values))
    out.push({ name, keyId: key.keyId, encryptedValue: await sealSecret(key.key, value) });
  return out;
}

/** Cloudflare's token page, pre-filled with the permissions the site's publishing needs. */
export function cloudflareTokenUrl(siteName: string): string {
  const permissions = [
    { key: "workers_scripts", type: "edit" },
    { key: "workers_r2", type: "edit" },
    { key: "d1", type: "edit" },
    { key: "account_settings", type: "read" },
  ];
  const params = new URLSearchParams({
    permissionGroupKeys: JSON.stringify(permissions),
    name: `OpenSpace — ${siteName}`.slice(0, 100),
    accountId: "*",
    zoneId: "all",
  });
  return `https://dash.cloudflare.com/profile/api-tokens?${params.toString()}`;
}

/** Cloudflare account ids are 32 hex characters. */
export const ACCOUNT_ID_RE = /^[0-9a-f]{32}$/;
/** API tokens are 40 URL-safe characters (allow a little slack for future formats). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{37,120}$/;
