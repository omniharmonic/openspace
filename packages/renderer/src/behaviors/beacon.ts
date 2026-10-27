/**
 * The page path as the site knows it: without the deploy base path (a GitHub Pages project
 * site lives under `/<repo>/`), so analytics show `/join/`, not `/<repo>/join/`. Paths outside
 * the base are sent unchanged, so stripping again on the Hub is harmless.
 */
export function sitePath(pathname: string, base = ""): string {
  const b = base.replace(/\/+$/, "");
  if (!b || (pathname !== b && !pathname.startsWith(`${b}/`))) return pathname;
  return pathname.slice(b.length) || "/";
}

/** Cookieless analytics beacon (~1 KB): path, referrer, screen class and UTM tags to the Hub. */
export default function beacon(body: HTMLElement): void {
  const { osHub: hub, osSite: site, osBase: base } = body.dataset;
  if (!hub || !site || navigator.webdriver) return;
  const q = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = q.get(`utm_${k}`);
    if (v) utm[k] = v;
  }
  const w = innerWidth;
  const payload = JSON.stringify({
    p: sitePath(location.pathname, base),
    r:
      document.referrer && new URL(document.referrer).host !== location.host
        ? document.referrer
        : "",
    s: w < 768 ? "m" : w < 1200 ? "t" : "d",
    u: utm,
  });
  const url = `${hub}/a/${site}`;
  if (!navigator.sendBeacon?.(url, payload)) {
    fetch(url, { method: "POST", body: payload, keepalive: true }).catch(() => {});
  }
}
