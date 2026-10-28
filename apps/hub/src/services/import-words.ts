/**
 * The importer's report (IMPORT-REPORT.md) is written for whoever maintains the site — it can
 * say "Cloudflare target", "Heading 1" or "import it in the Hub". Everything an owner reads
 * (Studio's "What needs your attention", "Finish setting up", Claude's import_status) goes
 * through `plainWords` first: known importer sentences become friendly ones, and the remaining
 * developer words are replaced (wave 3: plain language, no technical decisions).
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Hosts that only serve files (wave 4): they never kept a subscriber list, so "export them there"
 * sends people looking for something that doesn't exist.
 */
const NO_LIST_HOSTS =
  /^(?:GitHub Pages|GitHub|Jekyll(?: \(GitHub Pages\))?|Hugo|Eleventy|the original site|your old site)$/i;

function subscribersAdvice(from: string): string {
  return NO_LIST_HOSTS.test(from.trim())
    ? "Your sign-up forms came across, and new sign-ups are now kept for you in OpenSpace. Your old site didn’t keep a subscriber list itself — if its form sent sign-ups to an email service (like Mailchimp or Buttondown), download the list there, then add it in Inbox → Subscribers → Import."
    : `Your sign-up forms came across. Your subscriber list doesn’t move by itself: download it from ${from}, then add it in Inbox → Subscribers → Import.`;
}

/** Whole sentences the importer writes, in the owner's words. */
const SENTENCES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^(\d+) product\(s\) imported as catalog content\. Selling needs the Cloudflare target and Stripe connected in the Hub; (.*) stay in (\w+)\.?$/i,
    (m) =>
      `Your ${plural(Number(m[1]), "product")} came across, with pictures and prices. Selling online again is a step in “Finish setting up” when you’re ready. ${capitalize(m[2] as string)} stay in ${m[3]} — download what you need before you close your old account.`,
  ],
  [
    /^Newsletter signup recreated\. .*?subscribers are not moved: export your list from (.+?)(?: \(or your email service\))? and import it in the Hub\.?$/i,
    (m) => subscribersAdvice(m[1] as string),
  ],
  [
    /^Sign-up forms came across, but subscribers stay with (.+?)\. Export them there and import them here\.?$/i,
    (m) => subscribersAdvice(m[1] as string),
  ],
  [
    /^The page had no Heading 1; its first heading was made the Heading 1.*$/i,
    () =>
      "This page had no main title, so its first heading became the main title (it helps search engines and screen readers).",
  ],
  [
    /^The home page was a (?:collection|list of posts) on (.+?); it is now a page listing that collection.*$/i,
    (m) =>
      `On ${m[1]}, your home page was a list (of posts or products). It’s now a home page that shows that list, and the list also has its own page. Old links still work.`,
  ],
  [
    /^Member area: its content isn't public, so it was not imported\..*$/i,
    () =>
      "This members-only area couldn’t be read, so it didn’t come across. You can make members-only pages again later — it’s a step in “Finish setting up”.",
  ],
  [
    /^Password-protected: its content isn't readable, so it was not imported\..*$/i,
    () =>
      "This password-protected page couldn’t be read, so it didn’t come across. You can add password pages again later — it’s a step in “Finish setting up”.",
  ],
  [
    /^The "(.+)" page belongs to a shop plugin \(WooCommerce or similar\); it was not imported\..*$/i,
    (m) =>
      `The “${m[1]}” page was part of your shop, so it didn’t come across. Selling online again is a step in “Finish setting up”.`,
  ],
  [
    /^WooCommerce is installed\..*$/i,
    () =>
      "Your shop’s orders and customers didn’t come across. Selling online again (with a small catalog) is a step in “Finish setting up”.",
  ],
  [
    /^(\d+) page\(s\) had little or no readable content in their HTML.*$/i,
    (m) =>
      `${plural(Number(m[1]), "page")} came across nearly empty, because your old site builds them as they load. Choose “Try again” on the move and turn on “If pages come across empty”, or ask Claude to fill them in.`,
  ],
];

/** Developer words left inside other sentences. */
const WORDS: Array<[RegExp, string]> = [
  [/\(Cloudflare target(?: with Stripe)?\)/gi, "(a later setup step)"],
  [
    /\bneeds? the Cloudflare target and Stripe(?: connected in the Hub)?/gi,
    "needs a later setup step",
  ],
  [/\bthe Cloudflare target\b/gi, "the shop setup step"],
  [/\bimport it in the Hub\b/gi, "add it to your site in OpenSpace"],
  [/\bin the Hub\b/gi, "in OpenSpace"],
  [/\bHeading 1\b/g, "main title"],
  [/\bimported as a plain page\b/gi, "came across as an ordinary page"],
  [/\bcatalog content\b/gi, "a catalog"],
  [/`?--render`?(?: \([^)]*\))?/g, "the “If pages come across empty” option"],
];

function capitalize(s: string): string {
  return s ? (s[0] as string).toUpperCase() + s.slice(1) : s;
}

/** "15 product(s)" → "15 products", "1 form(s)" → "1 form". */
function plurals(s: string): string {
  return s.replace(/\b(\d+)( [a-z]+)\(s\)/gi, (_m, n: string, word: string) =>
    Number(n) === 1 ? `${n}${word}` : `${n}${word}s`,
  );
}

export function plainWords(text: string): string {
  const s = text.trim();
  for (const [re, to] of SENTENCES) {
    const m = s.match(re);
    if (m) return to(m);
  }
  let out = s;
  for (const [re, to] of WORDS) out = out.replace(re, to);
  return plurals(out);
}
