/**
 * The "Finish setting up" list an import leaves behind (`content/setup-checklist.json`): what the
 * old site did that needs a step after the new site is live — taking payments, donations,
 * member areas, password pages, form emails, the newsletter, the web address, analytics,
 * comments. The import itself never turns any of these on (it always lands on free GitHub
 * Pages hosting and publishes); Studio walks the owner through each item afterwards.
 */
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import type { BuildResult } from "./map/site";
import { platformLabel, subscribersAdvice } from "./platform";
import type { SqSite } from "./types";

export const CHECKLIST_FILE = "content/setup-checklist.json";

export type SetupKind =
  | "store"
  | "donations"
  | "members"
  | "password-pages"
  | "forms-email"
  | "newsletter"
  | "domain"
  | "analytics"
  | "comments"
  | "custom-code"
  | "other";

export interface SetupItem {
  id: string;
  kind: SetupKind;
  title: string;
  detail: string;
  where?: string[];
  count?: number;
  status: "todo" | "done";
}

export interface SetupChecklist {
  version: 1;
  source: "import";
  /** The platform the site came from ("Squarespace"). */
  from: string;
  items: SetupItem[];
}

const PLATFORM_HOSTS =
  /(?:\.squarespace\.com|\.wixsite\.com|\.webflow\.io|\.wordpress\.com|\.carrd\.co|\.framer\.(?:website|app|ai)|\.weebly\.com|\.ghost\.io|\.github\.io|\.myshopify\.com|\.example|\.invalid|localhost)$/i;

function countBlocks(doc: SiteDocument, types: string[]): { n: number; where: string[] } {
  let n = 0;
  const where = new Set<string>();
  const visit = (v: unknown, page: string) => {
    if (Array.isArray(v)) for (const x of v) visit(x, page);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.type === "string" && types.includes(o.type) && "fields" in o) {
        n++;
        where.add(page);
      }
      for (const x of Object.values(o)) visit(x, page);
    }
  };
  for (const p of Object.values(doc.pages)) visit(p.sections, `/${p.slug}`);
  return { n, where: [...where] };
}

export function setupChecklist(sq: SqSite, build: BuildResult): SetupChecklist {
  const items: SetupItem[] = [];
  const from = platformLabel(sq.platform);
  const notices = build.notices;
  const whereOf = (kind: string, re?: RegExp) =>
    [
      ...new Set(
        notices.filter((n) => n.kind === kind && (!re || re.test(n.message))).map((n) => n.where),
      ),
    ].slice(0, 10);

  const products = sq.collections.filter((c) => c.kind === "products");
  const productCount = products.reduce((n, c) => n + c.items.length, 0);
  if (productCount || notices.some((n) => n.kind === "commerce"))
    items.push({
      id: "store",
      kind: "store",
      title: "Start selling again",
      detail: productCount
        ? `${productCount} product(s) came across as a catalog. To take payments, connect a payment account — we'll guide you through it.`
        : `Your ${from} site had a shop. Connect a payment account to sell here — we'll guide you through it.`,
      ...(products.length ? { where: products.map((c) => c.path) } : {}),
      ...(productCount ? { count: productCount } : {}),
      status: "todo",
    });
  const donate = notices.filter((n) => /donat/i.test(n.message));
  if (donate.length)
    items.push({
      id: "donations",
      kind: "donations",
      title: "Accept donations",
      detail:
        "Your old site took donations. Connect a payment account to turn the donate button back on.",
      where: [...new Set(donate.map((n) => n.where))].slice(0, 10),
      status: "todo",
    });
  if (notices.some((n) => n.kind === "members"))
    items.push({
      id: "members",
      kind: "members",
      title: "Set up member-only pages",
      detail: "Some pages were for members only. Choose who can see them and how people join.",
      where: whereOf("members"),
      status: "todo",
    });
  if (notices.some((n) => n.kind === "locked-page"))
    items.push({
      id: "password-pages",
      kind: "password-pages",
      title: "Protect your private pages",
      detail:
        "Some pages had a password and couldn't be read. Recreate them and give them a password.",
      where: whereOf("locked-page"),
      status: "todo",
    });
  const forms = countBlocks(build.doc, ["form"]);
  if (forms.n)
    items.push({
      id: "forms-email",
      kind: "forms-email",
      title: "Get form messages by email",
      detail: `${forms.n} form(s) came across. Messages are kept in OpenSpace; choose where to get an email when someone writes.`,
      where: forms.where,
      count: forms.n,
      status: "todo",
    });
  const newsletter = countBlocks(build.doc, ["newsletter"]);
  if (newsletter.n)
    items.push({
      id: "newsletter",
      kind: "newsletter",
      title: "Bring your newsletter subscribers",
      detail: subscribersAdvice(sq.platform),
      where: newsletter.where,
      status: "todo",
    });
  try {
    const host = new URL(sq.baseUrl).hostname.replace(/^www\./, "");
    if (!PLATFORM_HOSTS.test(`.${host}`) && host.includes("."))
      items.push({
        id: "domain",
        kind: "domain",
        title: `Use ${host} for your new site`,
        detail: `Your new site is live on a free address. When you're happy with it, we'll help you point ${host} at it — your old site keeps working until then.`,
        status: "todo",
      });
  } catch {
    // no address
  }
  const scripts = sq.customCode.filter((s) =>
    /analytics|gtag|googletagmanager|plausible|fathom|matomo|pixel/i.test(s),
  );
  if (
    scripts.length ||
    notices.some((n) => n.kind === "custom-code" && /analytics/i.test(n.message))
  )
    items.push({
      id: "analytics",
      kind: "analytics",
      title: "Turn on visitor statistics",
      detail:
        "Your old site counted visitors. Turn on OpenSpace's privacy-friendly statistics in one click.",
      status: "todo",
    });
  if (notices.some((n) => /comment/i.test(n.message) && n.kind !== "custom-code"))
    items.push({
      id: "comments",
      kind: "comments",
      title: "Decide about comments",
      detail: "Comments stay with the old comment service. Choose whether to add comments here.",
      status: "todo",
    });
  const code = notices.filter((n) => n.kind === "custom-code" && !/analytics/i.test(n.message));
  if (code.length || sq.customCode.length > scripts.length)
    items.push({
      id: "custom-code",
      kind: "custom-code",
      title: "Check special features",
      detail:
        "Your old site had add-ons (chat, booking or other widgets). See which ones you still need.",
      where: [...new Set(code.map((n) => n.where))].slice(0, 10),
      status: "todo",
    });
  // Fonts that couldn't be copied (licensed, or of unknown licence): their nearest free match
  // stands in until the owner uploads the real files under their own web licence.
  const fonts = (sq.theme.fontSubstitutes ?? []).filter((f) => f.source !== "system");
  if (fonts.length)
    items.push({
      id: "font-licence",
      kind: "other",
      title: "Use your own font licence",
      detail: `Your old site used ${fonts
        .map((f) => `${f.original}${f.service ? ` (from ${f.service})` : ""}`)
        .join(
          " and ",
        )}, which we're not allowed to copy, so the closest free ${fonts.length > 1 ? "fonts stand" : "font stands"} in (${fonts
        .map((f) => f.substitute)
        .join(
          ", ",
        )}). If you have a web licence, download the font files (WOFF2) from the font service and upload them in Site Styles → Your fonts — they're stored in media/fonts/ — then choose them for your headings and text.`,
      status: "todo",
    });
  return { version: 1, source: "import", from, items };
}
