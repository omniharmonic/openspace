/** Cookieless analytics beacon (~1 KB): path, referrer, screen class and UTM tags to the Hub. */
export default function beacon(body: HTMLElement): void {
  const { osHub: hub, osSite: site } = body.dataset;
  if (!hub || !site || navigator.webdriver) return;
  const q = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = q.get(`utm_${k}`);
    if (v) utm[k] = v;
  }
  const w = innerWidth;
  const payload = JSON.stringify({
    p: location.pathname,
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
