import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { createAppJwt, pemToPkcs8, pkcs1ToPkcs8 } from "../src/github/jwt";
import { encryptGitHubSecret, sealedBoxOpen } from "../src/github/sealed-box";
import {
  base64ToBytes,
  bytesToBase64,
  decryptSecret,
  encryptSecret,
  timingSafeEqual,
} from "../src/lib/crypto";
import { generateAppKey, pem } from "./keys";

/** Pull the PKCS#1 RSAPrivateKey out of a PKCS#8 envelope (the OCTET STRING payload). */
function pkcs8ToPkcs1(pkcs8: Uint8Array): Uint8Array {
  let i = 0;
  const readLen = () => {
    let len = pkcs8[i++] as number;
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let k = 0; k < n; k++) len = (len << 8) | (pkcs8[i++] as number);
    }
    return len;
  };
  i++; // SEQUENCE
  readLen();
  i += 3; // INTEGER 0
  i++; // AlgorithmIdentifier SEQUENCE
  const algLen = readLen();
  i += algLen;
  i++; // OCTET STRING
  const len = readLen();
  return pkcs8.slice(i, i + len);
}

describe("AES-GCM token encryption", () => {
  const key = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));

  it("round-trips and binds to the AAD", async () => {
    const sealed = await encryptSecret(key, "ghr_refresh_token", "usr_1");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("ghr_refresh_token");
    expect(await decryptSecret(key, sealed, "usr_1")).toBe("ghr_refresh_token");
    await expect(decryptSecret(key, sealed, "usr_2")).rejects.toThrow();
    const other = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    await expect(decryptSecret(other, sealed, "usr_1")).rejects.toThrow();
    await expect(encryptSecret("c2hvcnQ=", "x")).rejects.toThrow(/32 bytes/);
  });

  it("compares in constant time", async () => {
    expect(await timingSafeEqual("abc", "abc")).toBe(true);
    expect(await timingSafeEqual("abc", "abd")).toBe(false);
    expect(await timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("GitHub App JWT", () => {
  it("signs RS256 JWTs with PKCS#8 and PKCS#1 keys", async () => {
    const { pair, pkcs8 } = await generateAppKey();
    const pkcs1 = pkcs8ToPkcs1(pkcs8);
    expect(pkcs1ToPkcs8(pkcs1)).toEqual(pkcs8);
    expect(pemToPkcs8(pem("RSA PRIVATE KEY", pkcs1))).toEqual(pkcs8);
    // Escaped newlines (as pasted into env vars) are accepted.
    expect(pemToPkcs8(pem("PRIVATE KEY", pkcs8).replace(/\n/g, "\\n"))).toEqual(pkcs8);

    const now = Date.UTC(2026, 9, 26, 12, 0, 0);
    for (const key of [pem("PRIVATE KEY", pkcs8), pem("RSA PRIVATE KEY", pkcs1)]) {
      const jwt = await createAppJwt("12345", key, now);
      const [h, p, s] = jwt.split(".") as [string, string, string];
      const decode = (x: string) => JSON.parse(atob(x.replace(/-/g, "+").replace(/_/g, "/")));
      expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
      expect(decode(p)).toEqual({ iat: now / 1000 - 60, exp: now / 1000 + 540, iss: "12345" });
      const sig = base64ToBytes(
        s
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(s.length / 4) * 4, "="),
      );
      const ok = await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        pair.publicKey,
        sig,
        new TextEncoder().encode(`${h}.${p}`),
      );
      expect(ok).toBe(true);
    }
  });
});

describe("sealed box (Actions secrets)", () => {
  it("encrypts so only the recipient can open it", () => {
    const recipient = nacl.box.keyPair();
    const sealed = encryptGitHubSecret(bytesToBase64(recipient.publicKey), "cf-api-token");
    const opened = sealedBoxOpen(base64ToBytes(sealed), recipient.publicKey, recipient.secretKey);
    expect(opened && new TextDecoder().decode(opened)).toBe("cf-api-token");
    const stranger = nacl.box.keyPair();
    expect(sealedBoxOpen(base64ToBytes(sealed), stranger.publicKey, stranger.secretKey)).toBeNull();
  });
});
