/**
 * Server-side fetching of agent-supplied image URLs (`upload_image`), guarded against SSRF:
 * https on the default port only, no private / loopback / link-local / metadata addresses —
 * neither as IP literals, internal names nor what the name resolves to — checked on every
 * redirect hop (`fetchImage` follows redirects by hand and calls this for each hop).
 */
import { ToolError } from "@openspace/mcp-tools";
import type { FetchLike } from "../github/http";
import type { DnsResolver } from "../services/domains";

function ipv4Parts(host: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split(".").map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/** Private, loopback, link-local, CGNAT, multicast, reserved or otherwise non-public IPv4. */
export function isPrivateIPv4(host: string): boolean {
  const p = ipv4Parts(host);
  if (!p) return false;
  const [a = 0, b = 0, c = 0] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Expand an IPv6 literal to 8 groups (null if it isn't one). */
function ipv6Groups(host: string): number[] | null {
  let h = host.toLowerCase();
  if (!h.includes(":")) return null;
  const zone = h.indexOf("%");
  if (zone >= 0) h = h.slice(0, zone);
  // Embedded IPv4 tail (::ffff:1.2.3.4).
  const v4 = h.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4?.[1]) {
    const p = ipv4Parts(v4[1]);
    if (!p) return null;
    h = `${h.slice(0, -v4[1].length)}${((p[0] ?? 0) * 256 + (p[1] ?? 0)).toString(16)}:${((p[2] ?? 0) * 256 + (p[3] ?? 0)).toString(16)}`;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) => (s ? s.split(":") : []);
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const out = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN));
  return out.some(Number.isNaN) ? null : out;
}

export function isPrivateIPv6(host: string): boolean {
  const g = ipv6Groups(host);
  if (!g) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (zeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  // IPv4-mapped / -compatible: judge the IPv4 address.
  if (zeroPrefix && (g5 === 0xffff || g5 === 0)) {
    const v4 = `${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`;
    return isPrivateIPv4(v4);
  }
  // NAT64 (64:ff9b::/96) embeds an IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0)
    return isPrivateIPv4(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
  // 6to4 (2002::/16) embeds an IPv4 address in the next 32 bits.
  if (g0 === 0x2002) return isPrivateIPv4(`${g1 >> 8}.${g1 & 255}.${g2 >> 8}.${g2 & 255}`);
  return (
    (g0 === 0x2001 && g1 === 0) || // Teredo 2001::/32 (tunnels to arbitrary IPv4 hosts)
    (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) || // discard-only 100::/64
    (g0 === 0x64 && g1 === 0xff9b && g2 === 1) || // local-use NAT64 64:ff9b:1::/48
    (g0 & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (g0 & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (g0 & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (g0 & 0xff00) === 0xff00 || // multicast
    (g0 === 0x2001 && g1 === 0x0db8) // documentation
  );
}

export function isPrivateAddress(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return isPrivateIPv4(h) || isPrivateIPv6(h);
}

const isIpLiteral = (host: string) =>
  ipv4Parts(host) !== null || ipv6Groups(host.replace(/^\[|\]$/g, "")) !== null;

/** Names that only mean something inside a network. */
export function isInternalHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return (
    !h.includes(".") ||
    h === "localhost" ||
    /\.(localhost|local|internal|intranet|lan|home|corp|home\.arpa)$/.test(h) ||
    h === "metadata.google.internal" ||
    // Decimal / hex / octal IPv4 spellings ("2130706433", "0x7f.1") — never legitimate here.
    /^[0-9x.]+$/.test(h)
  );
}

const refuse = (message: string) => new ToolError(message, "blocked_address");

/**
 * A `fetch` for one hop: refuses unsafe targets, never follows redirects itself, and resolves
 * the name (A + AAAA) to refuse names that point into private networks.
 */
export function guardedFetch(fetchImpl: FetchLike, dns: DnsResolver | null): typeof fetch {
  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "https:") throw refuse("Only https:// image addresses can be fetched.");
    if (url.port && url.port !== "443")
      throw refuse("Image addresses must use the standard https port.");
    if (url.username || url.password) throw refuse("Image addresses can't contain credentials.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIpLiteral(host)) {
      if (isPrivateAddress(host))
        throw refuse("That address points into a private network, so it can't be fetched.");
    } else {
      if (isInternalHostname(host))
        throw refuse("That address points into a private network, so it can't be fetched.");
      if (dns) {
        let addrs: string[];
        try {
          addrs = [...(await dns.resolve(host, "A")), ...(await dns.resolve(host, "AAAA"))];
        } catch {
          throw new ToolError(`Couldn't look up ${host}. Check the address.`, "fetch_failed");
        }
        if (addrs.some(isPrivateAddress))
          throw refuse("That address points into a private network, so it can't be fetched.");
      }
    }
    return fetchImpl(url.toString(), {
      ...init,
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
  };
  return guarded as typeof fetch;
}
