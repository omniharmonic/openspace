/**
 * What someone saves by leaving a website builder, from the landing page's published plan prices
 * (apps/www/src/site/www.ts `PRICES`, read 27 October 2026 — keep the two in step). The plan is
 * the builder's cheapest that does the job: with a custom domain, or (for a shop) the cheapest
 * that sells without a platform fee.
 */
const MONTHLY: Record<string, { basic: number; store: number }> = {
  squarespace: { basic: 19, store: 29 },
  wix: { basic: 17, store: 29 },
  webflow: { basic: 15, store: 74 },
};

/** Yearly saving in US dollars, or null when the old platform isn't one we have prices for. */
export function yearlySaving(from: string | null | undefined, sells: boolean): number | null {
  if (!from) return null;
  const plan = MONTHLY[from.trim().toLowerCase().split(/\s+/)[0] ?? ""];
  if (!plan) return null;
  return (sells ? plan.store : plan.basic) * 12;
}

export function formatDollars(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}
