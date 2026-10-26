import { bytesToBase64 } from "../src/lib/crypto";

export async function generateAppKey() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer,
  );
  return { pair, pkcs8 };
}

export const pem = (label: string, der: Uint8Array) =>
  `-----BEGIN ${label}-----\n${(bytesToBase64(der).match(/.{1,64}/g) ?? []).join("\n")}\n-----END ${label}-----\n`;
