/**
 * "Finish setting up": the steps a site still needs AFTER its first live version, worked out from
 * the site's own content (a shop, donations, member pages, password pages, forms), the site's
 * state (domain, hosting, payments) and the importer's list (`content/setup-checklist.json`).
 *
 * Pure: the Studio screens, the dashboard chip and the tests all use the same list.
 */
import type { Block, SiteDocument } from "@omniharmonic/openspace-schema";
import type { ImportedSetupItem, SetupInfo } from "../../api";
import type { Site } from "../../api/types";

export type SetupKind = ImportedSetupItem["kind"];

/** Which guided wizard an item opens. */
export type WizardId =
  | "shop"
  | "donations"
  | "members"
  | "passwords"
  | "domain"
  | "forms"
  | "newsletter"
  | "analytics"
  | "personalize"
  | "ai"
  | "info";

export type SetupStatus =
  /** Ready to start. */
  | "todo"
  /** Finished (detected from the site, or marked done). */
  | "done"
  /** Can't start yet: the site's first version isn't live (wow first). */
  | "later";

export interface SetupItem {
  id: string;
  kind: SetupKind;
  title: string;
  /** One sentence: why it's worth doing. */
  why: string;
  /** Rough time, in minutes. */
  minutes: number;
  status: SetupStatus;
  wizard: WizardId;
  /** Extra plain detail (from the importer). */
  detail: string | null;
  /** Where on the site it shows up (paths). */
  where: string[];
  count: number | null;
  /** Found on the site / left by the import / always useful. */
  source: "content" | "import" | "always";
}

export interface ChecklistInput {
  doc: SiteDocument | null;
  site: Pick<Site, "deployTarget" | "domain" | "status">;
  setup: SetupInfo | undefined;
  /** Payments can take money (Stripe connected, or the owner's own keys). */
  paymentsReady: boolean;
  /** Ids the owner marked as done (kept in this browser). */
  acknowledged: readonly string[];
  /** An AI app (Claude) is connected to this site. */
  aiConnected?: boolean;
}

const COPY: Record<
  Exclude<SetupKind, "other" | "comments" | "custom-code">,
  { title: string; why: string; minutes: number; wizard: WizardId }
> = {
  store: {
    title: "Open your shop",
    why: "Your products are already on your site; this lets visitors pay you directly, with no platform fee.",
    minutes: 10,
    wizard: "shop",
  },
  donations: {
    title: "Take donations online",
    why: "Supporters can give right on your site, straight into your own Stripe account.",
    minutes: 10,
    wizard: "donations",
  },
  members: {
    title: "Turn on member sign-in",
    why: "Members sign in with a link sent to their email — nobody has a password to forget.",
    minutes: 10,
    wizard: "members",
  },
  "password-pages": {
    title: "Turn on password pages",
    why: "Pages you've protected with a password stay hidden until this is on.",
    minutes: 10,
    wizard: "passwords",
  },
  "forms-email": {
    title: "Get your form messages",
    why: "Messages people send through your forms already arrive in your Inbox — here's where to find them.",
    minutes: 1,
    wizard: "forms",
  },
  newsletter: {
    title: "Collect newsletter sign-ups",
    why: "Sign-ups are kept for you, and you can send updates from Studio.",
    minutes: 2,
    wizard: "newsletter",
  },
  domain: {
    title: "Use your own domain",
    why: "Put your site at your own address, like yourname.com. Your visitors won't notice the move.",
    minutes: 15,
    wizard: "domain",
  },
  analytics: {
    title: "Check your visitor stats",
    why: "OpenSpace counts visits without cookies, so you don't need a cookie banner.",
    minutes: 1,
    wizard: "analytics",
  },
};

/** Every block on every page and in the footer. */
function allBlocks(doc: SiteDocument): Block[] {
  const out: Block[] = [];
  for (const page of Object.values(doc.pages))
    for (const section of page.sections) out.push(...section.blocks);
  out.push(...(doc.site.footer?.blocks ?? []));
  return out;
}

/** What the site's content says it needs. */
export function contentNeeds(doc: SiteDocument | null) {
  const needs = {
    store: 0,
    donations: 0,
    members: 0,
    passwords: 0,
    forms: 0,
    newsletter: 0,
    storeWhere: [] as string[],
  };
  if (!doc) return needs;
  for (const [name, items] of Object.entries(doc.collections ?? {})) {
    const products = Object.values(items ?? {}).filter((i) => i.kind === "products").length;
    if (products) {
      needs.store += products;
      needs.storeWhere.push(`/${name}`);
    }
  }
  for (const b of allBlocks(doc)) {
    if (b.type === "product" && !needs.store) needs.store = 1;
    if (b.type === "donation" && (b.fields as { mode?: string }).mode !== "link")
      needs.donations += 1;
    if (b.type === "member-login") needs.members += 1;
    if (b.type === "form") needs.forms += 1;
    if (b.type === "newsletter") needs.newsletter += 1;
  }
  for (const page of Object.values(doc.pages)) {
    if (page.access?.members) needs.members += 1;
    if (page.access?.password) needs.passwords += 1;
  }
  return needs;
}

/** The checklist, most valuable first. */
export function buildChecklist(input: ChecklistInput): SetupItem[] {
  const { doc, site, setup, paymentsReady, acknowledged } = input;
  const live = setup?.everLive ?? site.status === "live";
  const cloudflare = site.deployTarget === "cloudflare";
  const needs = contentNeeds(doc);
  const imported = setup?.imported?.items ?? [];
  const items: SetupItem[] = [];
  const seen = new Set<SetupKind>();

  const known = (
    kind: Exclude<SetupKind, "other" | "comments" | "custom-code">,
    found: boolean,
    done: boolean,
    extra: { needsLive?: boolean; count?: number; where?: string[] } = {},
  ) => {
    const imp = imported.find((i) => i.kind === kind);
    if (!found && !imp) return;
    seen.add(kind);
    const c = COPY[kind];
    const isDone = done || acknowledged.includes(kind) || imp?.done === true;
    items.push({
      id: kind,
      kind,
      title: c.title,
      why: c.why,
      minutes: c.minutes,
      wizard: c.wizard,
      status: isDone ? "done" : extra.needsLive && !live ? "later" : "todo",
      detail: imp?.detail ?? null,
      where: [...new Set([...(extra.where ?? []), ...(imp?.where ?? [])])],
      count: imp?.count ?? extra.count ?? null,
      source: found ? "content" : "import",
    });
  };

  // One list for everything (wave 3: the editor's separate "Get your site ready" card is gone).
  // A site made from a template starts with sample words and pictures: making it yours comes
  // first. It ticks itself the first time something on the site is edited (see markSetupDone).
  if (!setup?.imported)
    items.push(
      always("personalize", "Make it yours", {
        why: "Change the headline, the main photo and the logo, so the site is clearly yours.",
        minutes: 5,
        done: acknowledged.includes("personalize"),
      }),
    );

  known("store", needs.store > 0, cloudflare && paymentsReady, {
    needsLive: true,
    count: needs.store || undefined,
    where: needs.storeWhere,
  });
  known("donations", needs.donations > 0, cloudflare && paymentsReady, { needsLive: true });
  known("members", needs.members > 0, cloudflare, { needsLive: true });
  known("password-pages", needs.passwords > 0, cloudflare, { needsLive: true });
  known("forms-email", needs.forms > 0, false);
  known("newsletter", needs.newsletter > 0, false);
  // A domain is worth it for every site.
  known("domain", true, Boolean(site.domain));
  items.push(
    always("ai", "Connect your AI", {
      why: "Ask Claude to write, edit and check your site for you, in plain words.",
      minutes: 3,
      done: input.aiConnected === true || acknowledged.includes("ai"),
    }),
  );
  known("analytics", false, false);

  for (const imp of imported) {
    if (seen.has(imp.kind) && imp.kind !== "other") continue;
    const id = `import:${imp.id}`;
    items.push({
      id,
      kind: imp.kind,
      title: imp.title,
      why: imp.detail ?? "Something from your old site that needs a quick look.",
      minutes: 5,
      wizard: "info",
      status: imp.done || acknowledged.includes(id) ? "done" : "todo",
      detail: null,
      where: imp.where,
      count: imp.count,
      source: "import",
    });
  }
  return items;
}

function always(
  id: "personalize" | "ai",
  title: string,
  o: { why: string; minutes: number; done: boolean },
): SetupItem {
  return {
    id,
    kind: "other",
    title,
    why: o.why,
    minutes: o.minutes,
    status: o.done ? "done" : "todo",
    wizard: id,
    detail: null,
    where: [],
    count: null,
    source: "always",
  };
}

/** "3 of 5 done" numbers. */
export function progress(items: readonly SetupItem[]) {
  const done = items.filter((i) => i.status === "done").length;
  return { done, total: items.length, left: items.length - done };
}

// --- per-browser acknowledgements -------------------------------------------------------------

const key = (siteId: string) => `openspace.setup.${siteId}`;

export function readAcknowledged(siteId: string): string[] {
  try {
    const raw = localStorage.getItem(key(siteId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeAcknowledged(siteId: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(key(siteId), JSON.stringify([...new Set(ids)]));
  } catch {
    // Private windows: the list still works for this visit.
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(SETUP_EVENT, { detail: { siteId } }));
}

/** Fired when a step is ticked, so every open copy of the list updates at once. */
export const SETUP_EVENT = "openspace:setup";

/** Tick a step that the editor saw happen (e.g. the first edit → "Make it yours"). */
export function markSetupDone(siteId: string, id: string): void {
  const ack = readAcknowledged(siteId);
  if (!ack.includes(id)) writeAcknowledged(siteId, [...ack, id]);
}
