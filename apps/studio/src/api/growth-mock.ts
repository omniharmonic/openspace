import { campaignEmail } from "@openspace/email-render";
import type { CollectionItem, SiteDocument } from "@openspace/schema";
import { canonicalJson } from "./canonical";
import {
  CampaignInputSchema,
  CampaignPatchSchema,
  firstIssue,
  SenderInputSchema,
} from "./growth-schemas";
import type {
  AnalyticsRange,
  AnalyticsReport,
  Breakdown,
  CampaignStats,
  CampaignView,
  DiscountCode,
  FormSummary,
  GrowthApi,
  GrowthSettings,
  Member,
  MemberTier,
  OrderView,
  PaymentsView,
  ProductStock,
  SenderCheck,
  SenderView,
  ServiceSettings,
  Submission,
  Subscriber,
} from "./growth-types";
import type { Approval, DownloadedFile, ManageApi } from "./manage-types";
import { type HubApi, HubError, type Site, type User } from "./types";

/**
 * In-memory implementation of the Task 25 routes for the mock Hub (dev + tests). Behaviour
 * follows the Hub contracts from Tasks 15, 16 and 18: role checks, plain-language errors with
 * the same codes, refunds that restock only when full, codes that are upper-cased, and so on.
 */

export interface GrowthSiteState {
  settings: ServiceSettings;
  forms: FormSummary[];
  submissions: Submission[];
  subscribers: Subscriber[];
  commerce: GrowthSettings;
  payments: PaymentsView;
  inventory: Record<string, { qty: number | null; lowStock: number | null }>;
  files: Record<string, { filename: string; size: number }>;
  orders: OrderView[];
  discounts: DiscountCode[];
  members: Member[];
  tiers: MemberTier[];
  senders: Array<SenderView & { verifyAttempts: number }>;
  campaigns: Array<CampaignView & { stats: CampaignStats | null }>;
  /** Test sends and campaign mail, newest last (the dev outbox). */
  outbox: Array<{
    to: string;
    subject: string;
    kind: "campaign" | "campaign-test" | "order-shipped";
  }>;
}

export interface GrowthMockState {
  sites: Record<string, GrowthSiteState>;
}

export interface GrowthMockContext {
  calls: Array<{ method: keyof HubApi; args: unknown[] }>;
  wait: () => Promise<unknown>;
  requireUser: () => User;
  findSite: (id: string) => Site;
  now: () => number;
  /** The site's current draft document (collections back the product list). */
  docOf: (site: Site) => SiteDocument;
  /** Apply an approved contribution through the room as the approver. */
  publishItem?: (site: Site, collection: string, item: CollectionItem, approver: User) => void;
  approvals: Record<string, Approval[]>;
  /** The manage mock's approval decision (wrapped to add `contentHash` checks). */
  decideApproval: ManageApi["decideApproval"];
  listApprovals: ManageApi["listApprovals"];
}

const clone = <T>(v: T): T => structuredClone(v);
const iso = (ms: number) => new Date(ms).toISOString();
const DAY = 86_400_000;

/** A short deterministic content hash (the Hub uses SHA-256; the mock only needs equality). */
export function mockContentHash(item: unknown): string {
  const s = canonicalJson(item);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822507);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/** Deterministic 0..1 noise from a string. */
function noise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const FIRST = ["Ana", "Ben", "Chloe", "Dev", "Ema", "Felix", "Gia", "Hugo", "Iris", "Jon", "Kai"];
const LAST = ["Moreno", "Clark", "Patel", "Nguyen", "Okafor", "Silva", "Berg", "Hart", "Ito"];

function person(i: number) {
  const first = FIRST[i % FIRST.length] as string;
  const last = LAST[(i * 7) % LAST.length] as string;
  return {
    first,
    name: `${first} ${last}`,
    email: `${first}.${last}${i > 10 ? i : ""}@example.com`.toLowerCase(),
  };
}

function seed(site: Site, now: number): GrowthSiteState {
  const forms: FormSummary[] = [
    {
      id: "contact",
      name: "Contact",
      fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "email", label: "Email", type: "email" },
        { name: "message", label: "Message", type: "textarea" },
      ],
      notifyOwner: true,
      total: 0,
      unread: 0,
    },
    {
      id: "retreat-interest",
      name: "Retreat interest",
      fields: [
        { name: "name", label: "Name", type: "text" },
        { name: "email", label: "Email", type: "email" },
        { name: "dates", label: "Which dates?", type: "checkbox-group" },
        { name: "notes", label: "Anything we should know?", type: "textarea" },
      ],
      notifyOwner: true,
      total: 0,
      unread: 0,
    },
  ];
  const messages = [
    "Do you offer classes for complete beginners? I've never done yoga before.",
    "Is there parking near the studio on weekday mornings?",
    "Could I book a private session for my mum's birthday?",
    "Hi! Are mats provided or should I bring my own?",
    "Do you have a student discount?",
    "I'd love to teach a guest workshop on breathwork. Who should I talk to?",
    "Is the Saturday class suitable during pregnancy?",
    "What's your cancellation policy for the 10-class pass?",
  ];
  const submissions: Submission[] = [];
  messages.forEach((message, i) => {
    const p = person(i);
    submissions.push({
      id: `sub_c${i + 1}`,
      formId: "contact",
      formName: "Contact",
      data: { name: p.name, email: p.email, message },
      read: i > 2,
      spam: false,
      source: "/contact",
      createdAt: iso(now - (i * 0.8 + 0.1) * DAY),
      purgeAt: iso(now - i * DAY + 365 * DAY),
    });
  });
  for (let i = 0; i < 4; i++) {
    const p = person(i + 20);
    submissions.push({
      id: `sub_r${i + 1}`,
      formId: "retreat-interest",
      formName: "Retreat interest",
      data: {
        name: p.name,
        email: p.email,
        dates: i % 2 ? ["Feb 6–8"] : ["Feb 6–8", "Mar 13–15"],
        notes: i === 0 ? "Vegetarian, please." : "",
        ...(i === 0 ? { health_form: "health-questionnaire.pdf" } : {}),
      },
      ...(i === 0
        ? {
            files: [
              {
                field: "health_form",
                id: "upl_mockhealth01",
                name: "health-questionnaire.pdf",
                type: "application/pdf",
                size: 182_400,
                url: "data:application/pdf;base64,JVBERi0xLjQK",
              },
            ],
          }
        : {}),
      read: i > 0,
      spam: false,
      source: "/retreats",
      createdAt: iso(now - (i * 1.7 + 0.3) * DAY),
      purgeAt: iso(now + 300 * DAY),
    });
  }
  submissions.push({
    id: "sub_spam1",
    formId: "contact",
    formName: "Contact",
    data: { name: "SEO Expert", email: "rank@spam.example", message: "Cheap backlinks!!!" },
    read: false,
    spam: true,
    source: "/contact",
    createdAt: iso(now - 0.5 * DAY),
    purgeAt: null,
  });

  const subscribers: Subscriber[] = Array.from({ length: 26 }, (_, i) => {
    const p = person(i + 3);
    const status: Subscriber["status"] =
      i === 4 ? "pending" : i === 9 ? "unsubscribed" : "confirmed";
    const tags = [i % 3 === 0 ? "retreats" : null, i % 4 === 1 ? "beginners" : null].filter(
      Boolean,
    ) as string[];
    return {
      id: `sbr_${i + 1}`,
      email: p.email,
      firstName: p.first,
      status,
      tags,
      source: i % 2 ? "/" : "/journal/slow-mornings",
      createdAt: iso(now - (i * 3 + 1) * DAY),
      confirmedAt: status === "confirmed" ? iso(now - i * 3 * DAY) : null,
      unsubscribedAt: status === "unsubscribed" ? iso(now - 2 * DAY) : null,
    };
  });

  const order = (
    n: number,
    o: Partial<OrderView> & Pick<OrderView, "items" | "status">,
    ageDays: number,
  ): OrderView => {
    const subtotal = o.items.reduce((s, it) => s + it.qty * it.unitAmount, 0);
    const shipping = o.items.some((it) => !it.digital) && o.kind !== "donation" ? 600 : 0;
    const total = subtotal + shipping;
    const p = person(n + 40);
    return {
      id: `ord_${n}`,
      number: 1000 + n,
      kind: "order",
      fulfillment: "unfulfilled",
      email: p.email,
      customerName: p.name,
      currency: "USD",
      total,
      refunded: 0,
      amounts: { subtotal, shipping, tax: 0, discount: 0, total },
      shipping: shipping
        ? {
            name: p.name,
            address: {
              line1: `${12 + n} Elm Street`,
              city: "Boulder",
              state: "CO",
              postal_code: "80302",
              country: "US",
            },
          }
        : null,
      tracking: null,
      note: null,
      mode: "connect",
      createdAt: iso(now - ageDays * DAY),
      paidAt: o.status === "pending" ? null : iso(now - ageDays * DAY),
      fulfilledAt: null,
      problem: null,
      ...o,
    };
  };
  const block = (qty = 1, size: "STD" | "WIDE" = "STD") => ({
    sku: `BLOCK-${size}`,
    title: `Cork yoga block — ${size === "STD" ? "Standard" : "Wide"}`,
    qty,
    unitAmount: size === "STD" ? 2400 : 2800,
    digital: false,
  });
  const guide = {
    sku: "GUIDE-PDF",
    title: "Home practice guide (PDF)",
    qty: 1,
    unitAmount: 1200,
    digital: true,
  };
  const orders: OrderView[] = [
    order(1, { status: "paid", items: [block(2)] }, 0.2),
    order(
      2,
      { status: "paid", items: [guide], fulfillment: "fulfilled", fulfilledAt: iso(now - 1 * DAY) },
      1,
    ),
    order(3, { status: "paid", items: [block(1, "WIDE"), guide] }, 1.4),
    order(
      4,
      {
        status: "out_of_stock",
        items: [block(1, "WIDE")],
        problem: {
          message: "The automatic refund didn't go through. Refund it from here.",
          attempts: 7,
          gaveUp: true,
        },
      },
      2,
    ),
    order(5, { status: "refunded", items: [block(1)], refunded: 3000 }, 6),
    order(
      9,
      {
        status: "paid",
        items: [
          {
            sku: "TEA-CLUB",
            title: "Studio tea of the month",
            qty: 1,
            unitAmount: 1500,
            digital: false,
            interval: "month",
          },
        ],
        subscription: { interval: "month", id: "sub_dev_tea", ended: false },
      },
      3,
    ),
    order(
      6,
      {
        status: "paid",
        items: [block(1)],
        fulfillment: "fulfilled",
        tracking: "9400 1000 0000 0000 0000 00",
        fulfilledAt: iso(now - 7 * DAY),
      },
      8,
    ),
    order(7, { status: "partially_refunded", items: [block(3)], refunded: 2400 }, 11),
    order(
      8,
      {
        kind: "donation",
        status: "paid",
        items: [{ sku: "donation", title: "Donation", qty: 1, unitAmount: 5000, digital: true }],
        fulfillment: "fulfilled",
        fulfilledAt: iso(now - 3 * DAY),
      },
      3,
    ),
  ];
  // Fix totals for refunded fixtures.
  for (const o of orders) if (o.status === "refunded") o.refunded = o.total;

  const tiers: MemberTier[] = [
    {
      id: "tier_circle",
      name: "Studio Circle",
      description: "Recorded classes, the monthly letter and 10% off workshops.",
      price: { amount: 1500, currency: "USD", interval: "month" },
      active: true,
      position: 0,
      members: 0,
    },
    {
      id: "tier_teachers",
      name: "Teacher library",
      description: "Sequences and notes for teachers in training.",
      price: { amount: 9000, currency: "USD", interval: "year" },
      active: true,
      position: 1,
      members: 0,
    },
  ];
  const members: Member[] = Array.from({ length: 7 }, (_, i) => {
    const p = person(i + 60);
    const tier = i < 3 ? "tier_circle" : i === 3 ? "tier_teachers" : null;
    return {
      id: `mem_${i + 1}`,
      email: p.email,
      name: p.name,
      tier,
      status: i === 6 ? "blocked" : "active",
      source: tier ? "checkout" : "sign-in",
      paid: tier !== null,
      createdAt: iso(now - (i * 9 + 2) * DAY),
      lastLoginAt: i === 5 ? null : iso(now - (i + 1) * DAY),
    };
  });

  const sentStats: CampaignStats = {
    recipients: 23,
    sent: 23,
    delivered: 22,
    failed: 0,
    bounced: 1,
    complained: 0,
    skipped: 0,
    queued: 0,
    opened: 0,
    clicked: 7,
    openRate: 0,
    clickRate: 7 / 22,
    trackOpens: false,
    links: [
      { url: "https://willowstreetyoga.com/classes", clicks: 9, uniqueClicks: 6 },
      { url: "https://willowstreetyoga.com/journal/slow-mornings", clicks: 2, uniqueClicks: 2 },
    ],
  };
  const textBlock = (id: string, text: string) => ({
    id: id as never,
    type: "text",
    v: 1,
    fields: {
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    },
  });
  const campaigns: GrowthSiteState["campaigns"] = [
    {
      id: "cmp_october",
      subject: "October at Willow Street",
      preheader: "New evening classes and a winter retreat",
      body: {
        blocks: [
          {
            id: "blk_c000000001" as never,
            type: "heading",
            v: 1,
            fields: { text: "New evening classes", level: "2", size: "md" },
          },
          textBlock(
            "blk_c000000002",
            "From November we're adding a slow candlelit flow every Tuesday at 7pm.",
          ),
          {
            id: "blk_c000000003" as never,
            type: "button",
            v: 1,
            fields: {
              label: "See the schedule",
              link: { type: "url", url: "https://willowstreetyoga.com/classes" },
              role: "primary",
            },
          },
        ],
      },
      segment: { tags: [], match: "any" },
      senderId: "snd_dev",
      trackOpens: false,
      status: "sent",
      sendAt: null,
      recipients: 23,
      error: null,
      createdAt: iso(now - 20 * DAY),
      updatedAt: iso(now - 18 * DAY),
      startedAt: iso(now - 18 * DAY),
      finishedAt: iso(now - 18 * DAY),
      stats: sentStats,
    },
    {
      id: "cmp_retreat",
      subject: "Winter retreat: early places",
      preheader: "",
      body: {
        blocks: [
          textBlock("blk_c000000004", "Places for our February retreat open to subscribers first."),
        ],
      },
      segment: { tags: ["retreats"], match: "any" },
      senderId: "snd_dev",
      trackOpens: false,
      status: "draft",
      sendAt: null,
      recipients: 0,
      error: null,
      createdAt: iso(now - 1 * DAY),
      updatedAt: iso(now - 1 * DAY),
      startedAt: null,
      finishedAt: null,
      stats: null,
    },
  ];

  return {
    settings: {
      notifyEmail: null,
      notifications: "instant",
      retentionMonths: 12,
      analyticsEnabled: true,
      weeklyDigest: false,
    },
    forms,
    submissions,
    subscribers,
    commerce: {
      currency: "USD",
      shippingOptions: [
        {
          id: "ship_std",
          label: "Standard shipping",
          amount: 600,
          minDays: 3,
          maxDays: 5,
          freeOver: 7500,
        },
        { id: "ship_pickup", label: "Pick up at the studio", amount: 0 },
      ],
      shippingCountries: ["US"],
      taxEnabled: false,
      allowPromotionCodes: true,
      donationMin: 5,
      donationMax: 5000,
      lowStockThreshold: 3,
      alertEmail: null,
      membersSignup: "open",
      autoMergeSecurity: true,
    },
    payments: {
      mode: "connect",
      provider: "dev",
      account: "acct_dev_willow",
      chargesEnabled: true,
      detailsSubmitted: true,
      ready: true,
      hasSovereignKey: false,
      webhookUrl: null,
    },
    inventory: {
      "BLOCK-STD": { qty: 14, lowStock: null },
      "BLOCK-WIDE": { qty: 2, lowStock: null },
    },
    files: { "GUIDE-PDF": { filename: "home-practice-guide.pdf", size: 4_812_330 } },
    orders,
    discounts: [
      {
        id: "dsc_welcome",
        code: "WELCOME10",
        percentOff: 10,
        amountOff: null,
        currency: null,
        maxRedemptions: null,
        expiresAt: null,
        active: true,
        createdAt: iso(now - 30 * DAY),
      },
    ],
    members,
    tiers,
    senders: [
      {
        id: "snd_dev",
        provider: "dev",
        fromEmail: `hello@${site.domain ?? "willowstreetyoga.com"}`,
        fromName: site.name,
        replyTo: null,
        domain: site.domain ?? "willowstreetyoga.com",
        dkimSelector: null,
        status: "verified",
        checks: [],
        verifiedAt: iso(now - 25 * DAY),
        checkedAt: iso(now - 25 * DAY),
        webhookUrl: null,
        verifyAttempts: 1,
      },
    ],
    campaigns,
    outbox: [],
  };
}

const SKU_DEFAULT = (collection: string, slug: string) => `${collection}/${slug}`;

export function createGrowthMock(ctx: GrowthMockContext): {
  api: GrowthApi;
  overrides: Pick<ManageApi, "decideApproval" | "listApprovals">;
  state: GrowthMockState;
  /** The room accepted an op from someone (contributor drafts create approval requests). */
  onRoomOp: (site: Site, op: { op: string; collection?: string; item?: CollectionItem }) => void;
} {
  const { calls, wait, requireUser, findSite, now } = ctx;
  const state: GrowthMockState = { sites: {} };

  const call = async (method: keyof HubApi, args: unknown[]) => {
    calls.push({ method, args });
    await wait();
    return requireUser();
  };
  const of = (siteId: string): GrowthSiteState => {
    const site = findSite(siteId);
    state.sites[siteId] ??= seed(site, now());
    return state.sites[siteId] as GrowthSiteState;
  };
  const role = (siteId: string) => findSite(siteId).role ?? "owner";
  const forbid = (message: string) => new HubError(403, "forbidden", message);
  const need = (siteId: string, min: "editor" | "designer" | "owner", what: string) => {
    const r = role(siteId);
    const rank = { contributor: 0, editor: 1, designer: 2, owner: 3 } as const;
    if (rank[r as keyof typeof rank] < rank[min]) throw forbid(what);
  };
  const notFound = (what: string) =>
    new HubError(404, "not_found", `${what} isn't there any more.`);

  // ---------------------------------------------------------------- forms & subscribers ----
  const formCounts = (s: GrowthSiteState) =>
    s.forms.map((f) => {
      const own = s.submissions.filter((x) => x.formId === f.id && !x.spam);
      return { ...f, total: own.length, unread: own.filter((x) => !x.read).length };
    });

  const matchesQ = (q: string | undefined, ...values: unknown[]) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return values.some((v) =>
      JSON.stringify(v ?? "")
        .toLowerCase()
        .includes(needle),
    );
  };

  const page = <T>(items: T[], limit = 50, cursor?: string | null) => {
    const start = cursor ? Number(cursor) : 0;
    const slice = items.slice(start, start + limit);
    return { slice, next: start + limit < items.length ? String(start + limit) : null };
  };

  const csv = (rows: unknown[][]) =>
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
            const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
            return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
          })
          .join(","),
      )
      .join("\n");

  // ----------------------------------------------------------------------------- analytics ----
  function analytics(siteId: string, range: AnalyticsRange): AnalyticsReport {
    const end = new Date(now());
    let from: Date;
    let to: Date;
    let name: string;
    if ("range" in range) {
      name = range.range;
      to = end;
      const days = range.range === "day" ? 0 : range.range === "week" ? 6 : 29;
      from = new Date(end.getTime() - days * DAY);
    } else {
      name = "custom";
      from = new Date(`${range.from}T00:00:00Z`);
      to = new Date(`${range.to}T00:00:00Z`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to)
        throw new HubError(400, "invalid_range", "Pick a start date before the end date.");
      if ((to.getTime() - from.getTime()) / DAY > 400)
        throw new HubError(400, "invalid_range", "Choose a range of 400 days or less.");
    }
    const series: AnalyticsReport["series"] = [];
    for (
      let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
      t <= to.getTime();
      t += DAY
    ) {
      const date = iso(t).slice(0, 10);
      const dow = new Date(t).getUTCDay();
      const base = 60 + 40 * Math.sin(t / (DAY * 9)) + (dow === 0 || dow === 6 ? -18 : 12);
      const visits = Math.max(4, Math.round(base * (0.75 + 0.5 * noise(siteId + date))));
      series.push({ date, visits, pageviews: Math.round(visits * (2.1 + noise(date) * 0.9)) });
    }
    const pageviews = series.reduce((s, d) => s + d.pageviews, 0);
    const visits = series.reduce((s, d) => s + d.visits, 0);
    const split = (entries: Array<[string, number]>): Breakdown[] => {
      const sum = entries.reduce((s, [, w]) => s + w, 0);
      return entries.map(([key, w]) => ({
        key,
        pageviews: Math.round((pageviews * w) / sum),
        visitors: Math.round((visits * w) / sum),
      }));
    };
    return {
      range: { name, from: iso(from.getTime()).slice(0, 10), to: iso(to.getTime()).slice(0, 10) },
      totals: { pageviews, visits, uniques: Math.round(visits * 0.93) },
      series,
      topPages: split([
        ["/", 38],
        ["/classes", 24],
        ["/journal/slow-mornings", 12],
        ["/about", 9],
        ["/events/tuesday-candlelight-flow", 7],
        ["/shop/cork-block", 5],
        ["/contact", 5],
      ]),
      referrers: split([
        ["google.com", 44],
        ["instagram.com", 31],
        ["facebook.com", 9],
        ["boulderweekly.com", 6],
      ]),
      sources: split([
        ["Search", 41],
        ["Social", 33],
        ["Direct", 18],
        ["Email", 8],
      ]),
      devices: split([
        ["Phone", 63],
        ["Desktop", 31],
        ["Tablet", 6],
      ]),
      countries: split([
        ["US", 81],
        ["CA", 8],
        ["GB", 5],
        ["DE", 3],
      ]),
      events: split([
        ["Book class clicked", 12],
        ["Newsletter signup", 5],
      ]),
      forms: [
        {
          formId: "contact",
          name: "Contact",
          submissions: Math.round(visits * 0.012),
          conversionRate: 0.012,
        },
        {
          formId: "retreat-interest",
          name: "Retreat interest",
          submissions: Math.round(visits * 0.004),
          conversionRate: 0.004,
        },
      ],
      sampled: false,
      store: "d1",
    };
  }

  // ------------------------------------------------------------------------------ products ----
  function products(siteId: string): ProductStock[] {
    const site = findSite(siteId);
    const s = of(siteId);
    const doc = ctx.docOf(site);
    const out: ProductStock[] = [];
    for (const [collection, items] of Object.entries(doc.collections)) {
      for (const item of Object.values(items)) {
        if (item.kind !== "products") continue;
        const fm = item.frontmatter;
        const base = fm.sku ?? SKU_DEFAULT(collection, item.slug);
        const variants = fm.variants?.length
          ? fm.variants.map((v, i) => ({
              sku: v.sku ?? `${base}#${i}`,
              title: `${fm.title} — ${Object.values(v.options).join(" / ")}`,
              price: v.price ?? fm.price,
              available: v.available ?? fm.available ?? true,
            }))
          : [{ sku: base, title: fm.title, price: fm.price, available: fm.available ?? true }];
        for (const v of variants) {
          const inv = s.inventory[v.sku];
          const tracked = inv !== undefined && inv.qty !== null;
          const threshold = inv?.lowStock ?? s.commerce.lowStockThreshold;
          out.push({
            sku: v.sku,
            title: v.title,
            price: v.price,
            available: v.available && fm.status === "published",
            digital: fm.digital === true,
            path: `/${collection}/${item.slug}/`,
            collection,
            slug: item.slug,
            tracked,
            qty: tracked ? (inv?.qty ?? null) : null,
            lowStock: inv?.lowStock ?? null,
            low: tracked && (inv?.qty ?? 0) <= threshold,
            hasFile: Boolean(s.files[v.sku]),
          });
        }
      }
    }
    return out;
  }

  /** Same rule as the Hub's "to send" list. */
  const toSend = (o: OrderView) =>
    (o.status === "paid" || o.status === "partially_refunded") &&
    o.fulfillment === "unfulfilled" &&
    o.kind === "order" &&
    o.items.some((i) => !i.digital);

  // ------------------------------------------------------------------------------ campaigns ----
  const campaignOf = (siteId: string, cid: string) => {
    const c = of(siteId).campaigns.find((x) => x.id === cid);
    if (!c) throw notFound("That email");
    return c;
  };
  const segmentCount = (siteId: string, seg: { tags: string[]; match: "any" | "all" } | null) =>
    of(siteId).subscribers.filter(
      (s) =>
        s.status === "confirmed" &&
        (!seg || seg.tags.length === 0
          ? true
          : seg.match === "all"
            ? seg.tags.every((t) => s.tags.includes(t))
            : seg.tags.some((t) => s.tags.includes(t))),
    ).length;
  const view = (c: GrowthSiteState["campaigns"][number]): CampaignView => {
    const { stats: _s, ...rest } = c;
    return clone(rest);
  };
  const requireSendable = (siteId: string, c: CampaignView) => {
    const s = of(siteId);
    if (c.status === "sent" || c.status === "sending")
      throw new HubError(409, "already_sent", "This email has already been sent.");
    if (!c.body.blocks.length || !c.subject.trim())
      throw new HubError(422, "empty_campaign", "Add a subject and some content first.");
    const sender = s.senders.find((x) => x.id === c.senderId) ?? s.senders[0];
    if (!sender)
      throw new HubError(409, "sender_required", "Connect an email sender before sending.");
    if (sender.status !== "verified")
      throw new HubError(409, "sender_unverified", "Your sender's domain isn't verified yet.");
    return sender;
  };
  const sendNow = (siteId: string, c: GrowthSiteState["campaigns"][number]) => {
    const s = of(siteId);
    const recipients = s.subscribers.filter((x) => x.status === "confirmed");
    const segment = c.segment;
    const chosen = recipients.filter(
      (x) =>
        !segment ||
        segment.tags.length === 0 ||
        (segment.match === "all"
          ? segment.tags.every((t) => x.tags.includes(t))
          : segment.tags.some((t) => x.tags.includes(t))),
    );
    for (const r of chosen) s.outbox.push({ to: r.email, subject: c.subject, kind: "campaign" });
    c.status = "sent";
    c.recipients = chosen.length;
    c.startedAt = iso(now());
    c.finishedAt = c.startedAt;
    c.updatedAt = c.startedAt;
    c.stats = {
      recipients: chosen.length,
      sent: chosen.length,
      delivered: chosen.length,
      failed: 0,
      bounced: 0,
      complained: 0,
      skipped: 0,
      queued: 0,
      opened: 0,
      clicked: 0,
      openRate: 0,
      clickRate: 0,
      trackOpens: c.trackOpens,
      links: [],
    };
  };

  const dnsChecks = (sender: SenderView, ok: boolean): SenderCheck[] => {
    const d = sender.domain;
    const spfName = sender.provider === "resend" ? `send.${d}` : d;
    return [
      {
        id: "spf",
        label: "Sending permission (SPF)",
        ok,
        name: spfName,
        expected: "v=spf1 include:amazonses.com ~all",
        found: ok ? ["v=spf1 include:amazonses.com ~all"] : [],
        hint: ok ? undefined : `Add a TXT record on ${spfName} with the value shown.`,
      },
      {
        id: "dkim",
        label: "Signature key (DKIM)",
        ok,
        name: `${sender.dkimSelector ?? "resend"}._domainkey.${d}`,
        expected: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4…",
        found: ok ? ["p=MIGfMA0GCSqGSIb3DQEBAQUAA4…"] : [],
        hint: ok ? undefined : "Copy the DKIM record from your email provider's dashboard.",
      },
      {
        id: "dmarc",
        label: "Policy (DMARC)",
        ok: true,
        name: `_dmarc.${d}`,
        expected: "v=DMARC1; p=none",
        found: ["v=DMARC1; p=none"],
      },
    ];
  };

  const approvalsOverride: Pick<ManageApi, "decideApproval" | "listApprovals"> = {
    async listApprovals(siteId, status) {
      const list = await ctx.listApprovals(siteId, status);
      const site = findSite(siteId);
      const doc = ctx.docOf(site);
      return list.map((a) => {
        const item = doc.collections[a.collection]?.[a.slug];
        return { ...a, contentHash: a.contentHash ?? (item ? mockContentHash(item) : undefined) };
      });
    },
    async decideApproval(siteId, approvalId, decision, note, contentHash) {
      const site = findSite(siteId);
      const doc = ctx.docOf(site);
      const pending = ctx.approvals[siteId]?.find((a) => a.id === approvalId);
      const item = pending ? doc.collections[pending.collection]?.[pending.slug] : undefined;
      if (decision === "approve" && pending && item) {
        const current = mockContentHash(item);
        if (contentHash && contentHash !== current)
          throw new HubError(
            409,
            "changed_since_review",
            "This was edited after you opened it. Review the latest version.",
          );
      }
      const result = await ctx.decideApproval(siteId, approvalId, decision, note);
      if (decision === "approve" && item && item.frontmatter.status === "draft")
        ctx.publishItem?.(
          site,
          pending?.collection as string,
          { ...item, frontmatter: { ...item.frontmatter, status: "published" } } as CollectionItem,
          requireUser(),
        );
      return result;
    },
  };

  const onRoomOp: (
    site: Site,
    op: { op: string; collection?: string; item?: CollectionItem },
  ) => void = (site, op) => {
    if (site.role !== "contributor" || op.op !== "collection.upsert" || !op.item || !op.collection)
      return;
    if (op.item.frontmatter.status !== "draft") return;
    const user = requireUser();
    ctx.approvals[site.id] ??= [];
    const list = ctx.approvals[site.id] as Approval[];
    const existing = list.find(
      (a) => a.collection === op.collection && a.slug === op.item?.slug && a.status === "pending",
    );
    const at = iso(now());
    if (existing) {
      existing.title = op.item.frontmatter.title;
      existing.updatedAt = at;
      existing.contentHash = mockContentHash(op.item);
      return;
    }
    list.push({
      id: `apr_${list.length + 1}_${now().toString(36)}`,
      collection: op.collection,
      slug: op.item.slug,
      title: op.item.frontmatter.title,
      submittedBy: { userId: user.id, login: user.login, name: user.name },
      status: "pending",
      note: null,
      createdAt: at,
      updatedAt: at,
      decidedAt: null,
      contentHash: mockContentHash(op.item),
    });
  };

  const api: GrowthApi = {
    // ------------------------------------------------------------------------ settings ----
    async getServiceSettings(siteId) {
      await call("getServiceSettings", [siteId]);
      return clone(of(siteId).settings);
    },
    async updateServiceSettings(siteId, patch) {
      await call("updateServiceSettings", [siteId, patch]);
      need(siteId, "designer", "Ask the owner or a designer to change these settings.");
      const s = of(siteId);
      if (
        patch.retentionMonths !== undefined &&
        !(patch.retentionMonths >= 1 && patch.retentionMonths <= 12)
      )
        throw new HubError(400, "invalid_settings", "Keep entries between 1 and 12 months.");
      if (patch.notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.notifyEmail))
        throw new HubError(400, "invalid_settings", "That email address doesn't look right.");
      Object.assign(s.settings, patch);
      return clone(s.settings);
    },
    async listQuotas(siteId) {
      await call("listQuotas", [siteId]);
      const s = of(siteId);
      return [
        { resource: "formSubmissions", limit: 1000, used: s.submissions.length, period: "month" },
        {
          resource: "subscribers",
          limit: 2000,
          used: s.subscribers.filter((x) => x.status === "confirmed").length,
          period: "total",
        },
        { resource: "transactionalEmails", limit: 3000, used: 41, period: "month" },
        { resource: "analyticsPageviews", limit: 100_000, used: 6_340, period: "month" },
        {
          resource: "storedSubmissionsMonths",
          limit: 12,
          used: s.settings.retentionMonths,
          period: "retention",
        },
      ];
    },

    // --------------------------------------------------------------------------- forms ----
    async listForms(siteId) {
      await call("listForms", [siteId]);
      need(siteId, "editor", "Editors and above can read form entries.");
      return clone(formCounts(of(siteId)));
    },
    async listSubmissions(siteId, query = {}) {
      await call("listSubmissions", [siteId, query]);
      need(siteId, "editor", "Editors and above can read form entries.");
      const s = of(siteId);
      const all = s.submissions
        .filter((x) => (query.spam ? x.spam : !x.spam))
        .filter((x) => !query.form || x.formId === query.form)
        .filter((x) => !query.unread || !x.read)
        .filter((x) => matchesQ(query.q, x.data, x.formName))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const { slice, next } = page(all, query.limit ?? 50, query.cursor);
      return {
        submissions: clone(slice),
        nextCursor: next,
        total: all.length,
        unread: all.filter((x) => !x.read).length,
      };
    },
    async setSubmissionRead(siteId, subId, read) {
      await call("setSubmissionRead", [siteId, subId, read]);
      const sub = of(siteId).submissions.find((x) => x.id === subId);
      if (!sub) throw notFound("That entry");
      sub.read = read;
      return clone(sub);
    },
    async markSubmissionsRead(siteId, input) {
      await call("markSubmissionsRead", [siteId, input]);
      const read = input.read ?? true;
      let changed = 0;
      for (const sub of of(siteId).submissions) {
        const hit = input.all
          ? !input.form || sub.formId === input.form
          : (input.ids ?? []).includes(sub.id);
        if (hit && sub.read !== read) {
          sub.read = read;
          changed++;
        }
      }
      return { changed };
    },
    async deleteSubmissions(siteId, ids) {
      await call("deleteSubmissions", [siteId, ids]);
      const s = of(siteId);
      const before = s.submissions.length;
      s.submissions = s.submissions.filter((x) => !ids.includes(x.id));
      return { deleted: before - s.submissions.length };
    },
    async downloadSubmissionsCsv(siteId, form): Promise<DownloadedFile> {
      await call("downloadSubmissionsCsv", [siteId, form]);
      const s = of(siteId);
      const rows = s.submissions.filter((x) => !form || x.formId === form);
      const fields = [...new Set(rows.flatMap((r) => Object.keys(r.data)))];
      const text = csv([
        ["id", "form_id", "form_name", "created_at", "read", "spam", "source", ...fields],
        ...rows.map((r) => [
          r.id,
          r.formId,
          r.formName,
          r.createdAt,
          r.read,
          r.spam,
          r.source,
          ...fields.map((f) => r.data[f]),
        ]),
      ]);
      return {
        blob: new Blob([text], { type: "text/csv" }),
        filename: form ? `${form}-entries.csv` : "form-entries.csv",
      };
    },

    // ----------------------------------------------------------------------- subscribers ----
    async listSubscribers(siteId, query = {}) {
      await call("listSubscribers", [siteId, query]);
      need(siteId, "editor", "Editors and above can see subscribers.");
      const s = of(siteId);
      const all = s.subscribers
        .filter((x) => !query.status || x.status === query.status)
        .filter((x) => !query.tag || x.tags.includes(query.tag))
        .filter((x) => matchesQ(query.q, x.email, x.firstName))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const { slice, next } = page(all, query.limit ?? 50, query.cursor);
      const count = (st: Subscriber["status"]) =>
        s.subscribers.filter((x) => x.status === st).length;
      return {
        subscribers: clone(slice),
        nextCursor: next,
        counts: {
          total: s.subscribers.length,
          confirmed: count("confirmed"),
          pending: count("pending"),
          unsubscribed: count("unsubscribed"),
        },
      };
    },
    async importSubscribers(siteId, input) {
      await call("importSubscribers", [siteId, input]);
      need(siteId, "designer", "Ask the owner or a designer to import subscribers.");
      if (input.consent !== true)
        throw new HubError(
          400,
          "consent_required",
          "Confirm these people agreed to hear from you.",
        );
      const s = of(siteId);
      const lines = input.csv.split(/\r?\n/).filter((l) => l.trim());
      const header = (lines.shift() ?? "").split(",").map((h) => h.trim().toLowerCase());
      const ei = header.indexOf("email");
      if (ei < 0) throw new HubError(400, "invalid_csv", "The file needs an “email” column.");
      const ni = header.findIndex((h) => h === "first_name" || h === "name");
      const ti = header.indexOf("tags");
      const result = {
        added: 0,
        updated: 0,
        skipped: [] as Array<{ row: number; email: string; reason: string }>,
      };
      lines.forEach((line, i) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const email = (cols[ei] ?? "").toLowerCase();
        const row = i + 2;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          result.skipped.push({ row, email, reason: "Not a valid email address" });
          return;
        }
        const tags = [
          ...(input.tags ?? []),
          ...(ti >= 0
            ? (cols[ti] ?? "")
                .split(/[;|]/)
                .map((t) => t.trim())
                .filter(Boolean)
            : []),
        ];
        const existing = s.subscribers.find((x) => x.email === email);
        if (existing?.status === "unsubscribed") {
          result.skipped.push({ row, email, reason: "Unsubscribed earlier" });
          return;
        }
        if (existing) {
          existing.tags = [...new Set([...existing.tags, ...tags])];
          result.updated++;
          return;
        }
        s.subscribers.push({
          id: `sbr_i${now().toString(36)}${i}`,
          email,
          firstName: ni >= 0 ? cols[ni] || null : null,
          status: "confirmed",
          tags: [...new Set(tags)],
          source: "import",
          createdAt: iso(now()),
          confirmedAt: iso(now()),
          unsubscribedAt: null,
        });
        result.added++;
      });
      return result;
    },
    async tagSubscribers(siteId, input) {
      await call("tagSubscribers", [siteId, input]);
      let changed = 0;
      for (const sub of of(siteId).subscribers) {
        if (!input.ids.includes(sub.id)) continue;
        const next = [...new Set([...sub.tags, ...(input.add ?? [])])].filter(
          (t) => !(input.remove ?? []).includes(t),
        );
        if (next.join() !== sub.tags.join()) changed++;
        sub.tags = next;
      }
      return { changed };
    },
    async updateSubscriber(siteId, subId, patch) {
      await call("updateSubscriber", [siteId, subId, patch]);
      const sub = of(siteId).subscribers.find((x) => x.id === subId);
      if (!sub) throw notFound("That subscriber");
      if (patch.tags) sub.tags = [...new Set(patch.tags)];
      if (patch.firstName !== undefined) sub.firstName = patch.firstName || null;
      if (patch.status === "unsubscribed") {
        sub.status = "unsubscribed";
        sub.unsubscribedAt = iso(now());
      }
      return clone(sub);
    },
    async deleteSubscriber(siteId, subId) {
      await call("deleteSubscriber", [siteId, subId]);
      const s = of(siteId);
      s.subscribers = s.subscribers.filter((x) => x.id !== subId);
    },

    // ------------------------------------------------------------------------- analytics ----
    async getAnalytics(siteId, range) {
      await call("getAnalytics", [siteId, range]);
      return analytics(siteId, range);
    },

    // -------------------------------------------------------------------------- commerce ----
    async getCommerceSettings(siteId) {
      await call("getCommerceSettings", [siteId]);
      need(siteId, "editor", "Editors and above can see store settings.");
      const s = of(siteId);
      return { settings: clone(s.commerce), payments: clone(s.payments) };
    },
    async updateCommerceSettings(siteId, patch) {
      await call("updateCommerceSettings", [siteId, patch]);
      need(siteId, "designer", "Ask the owner or a designer to change store settings.");
      const s = of(siteId);
      const next = { ...s.commerce, ...patch };
      if (next.donationMin > next.donationMax)
        throw new HubError(
          422,
          "invalid_settings",
          "The smallest gift must be less than the largest.",
        );
      if (next.shippingOptions.length > 5)
        throw new HubError(422, "invalid_settings", "You can offer up to 5 shipping options.");
      next.shippingOptions = next.shippingOptions.map((o, i) => ({
        ...o,
        id: o.id ?? `ship_${now().toString(36)}${i}`,
      }));
      s.commerce = next;
      return clone(next);
    },
    async startStripeConnect(siteId, returnUrl) {
      await call("startStripeConnect", [siteId, returnUrl]);
      need(siteId, "owner", "Only the owner can connect payments.");
      const s = of(siteId);
      s.payments.account ??= `acct_dev_${siteId}`;
      s.payments.mode = "connect";
      s.payments.detailsSubmitted = true;
      s.payments.chargesEnabled = true;
      return {
        url: `about:blank#stripe-onboarding-${s.payments.account}`,
        account: s.payments.account,
      };
    },
    async refreshStripeConnect(siteId) {
      await call("refreshStripeConnect", [siteId]);
      need(siteId, "designer", "Ask the owner or a designer to check payments.");
      const p = of(siteId).payments;
      p.ready = p.mode === "sovereign" ? p.hasSovereignKey : p.chargesEnabled && p.detailsSubmitted;
      return clone(p);
    },
    async setSovereignKeys(siteId, keys) {
      await call("setSovereignKeys", [
        siteId,
        { secretKey: "[sealed]", webhookSecret: "[sealed]" },
      ]);
      need(siteId, "owner", "Only the owner can add payment keys.");
      if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{8,}$/.test(keys.secretKey))
        throw new HubError(422, "invalid_key", "That doesn't look like a Stripe secret key.");
      if (!/^whsec_[A-Za-z0-9]{8,}$/.test(keys.webhookSecret))
        throw new HubError(422, "invalid_key", "That doesn't look like a webhook signing secret.");
      const p = of(siteId).payments;
      Object.assign(p, {
        mode: "sovereign",
        provider: "stripe",
        hasSovereignKey: true,
        ready: true,
        webhookUrl: `https://hub.openspace.dev/c/stripe/webhook/${siteId}`,
      });
      return clone(p);
    },
    async clearSovereignKeys(siteId) {
      await call("clearSovereignKeys", [siteId]);
      need(siteId, "owner", "Only the owner can remove payment keys.");
      const p = of(siteId).payments;
      Object.assign(p, { mode: "connect", hasSovereignKey: false, webhookUrl: null });
      p.ready = p.chargesEnabled && p.detailsSubmitted;
      return clone(p);
    },

    async listProducts(siteId) {
      await call("listProducts", [siteId]);
      return { products: products(siteId), source: "document" };
    },
    async setInventory(siteId, input) {
      await call("setInventory", [siteId, input]);
      const s = of(siteId);
      if (input.qty === null) {
        delete s.inventory[input.sku];
        return { sku: input.sku, tracked: false };
      }
      if (!Number.isInteger(input.qty) || input.qty < 0)
        throw new HubError(422, "invalid_qty", "Stock must be a whole number, 0 or more.");
      s.inventory[input.sku] = {
        qty: input.qty,
        lowStock: input.lowStock ?? s.inventory[input.sku]?.lowStock ?? null,
      };
      return {
        sku: input.sku,
        ...clone(s.inventory[input.sku] as { qty: number; lowStock: number | null }),
      };
    },
    async adjustInventory(siteId, sku, delta) {
      await call("adjustInventory", [siteId, sku, delta]);
      const inv = of(siteId).inventory[sku];
      if (!inv || inv.qty === null)
        throw new HubError(404, "not_tracked", "Stock isn't tracked for this item.");
      if (inv.qty + delta < 0)
        throw new HubError(409, "insufficient_stock", "There isn't that much in stock.");
      inv.qty += delta;
      return { sku, ...clone(inv) };
    },
    async uploadProductFile(siteId, sku, file, filename) {
      await call("uploadProductFile", [siteId, sku, filename]);
      need(siteId, "designer", "Ask the owner or a designer to upload files.");
      if (file.size > 100 * 1024 * 1024)
        throw new HubError(413, "too_large", "Files can be up to 100 MB.");
      of(siteId).files[sku] = { filename, size: file.size };
    },
    async deleteProductFile(siteId, sku) {
      await call("deleteProductFile", [siteId, sku]);
      delete of(siteId).files[sku];
    },

    // ---------------------------------------------------------------------------- orders ----
    async listOrders(siteId, query = {}) {
      await call("listOrders", [siteId, query]);
      need(siteId, "editor", "Editors and above can see orders.");
      const hidden = new Set(["pending", "expired", "failed"]);
      const all = of(siteId)
        .orders.filter((o) => (query.status ? o.status === query.status : !hidden.has(o.status)))
        .filter((o) => !query.kind || o.kind === query.kind)
        .filter((o) => !query.fulfillment || o.fulfillment === query.fulfillment)
        .filter((o) => !query.problem || Boolean(o.problem))
        .filter((o) => !query.toSend || toSend(o))
        .filter((o) => !query.from || o.createdAt.slice(0, 10) >= query.from)
        .filter((o) => !query.to || o.createdAt.slice(0, 10) <= query.to)
        .filter((o) => {
          if (!query.q) return true;
          const q = query.q.trim().replace(/^#/, "");
          return String(o.number) === q || matchesQ(query.q, o.email, o.customerName);
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const { slice, next } = page(all, query.limit ?? 50, query.cursor);
      const every = of(siteId).orders;
      return {
        orders: clone(slice),
        nextCursor: next,
        counts: {
          toSend: every.filter(toSend).length,
          problem: every.filter((o) => o.problem && o.status !== "refunded").length,
        },
      };
    },
    async getOrder(siteId, orderId) {
      await call("getOrder", [siteId, orderId]);
      const o = of(siteId).orders.find((x) => x.id === orderId);
      if (!o) throw notFound("That order");
      return clone(o);
    },
    async fulfillOrder(siteId, orderId, input) {
      await call("fulfillOrder", [siteId, orderId, input]);
      const s = of(siteId);
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) throw notFound("That order");
      if (o.status !== "paid" && o.status !== "partially_refunded")
        throw new HubError(409, "not_fulfillable", "Only paid orders can be marked as sent.");
      const fulfilled = input.fulfilled ?? true;
      o.fulfillment = fulfilled ? "fulfilled" : "unfulfilled";
      o.fulfilledAt = fulfilled ? iso(now()) : null;
      if (input.tracking !== undefined) o.tracking = input.tracking || null;
      if (fulfilled && input.notify && o.email)
        s.outbox.push({
          to: o.email,
          subject: `Order #${o.number} is on its way`,
          kind: "order-shipped",
        });
      return clone(o);
    },
    async refundOrder(siteId, orderId, input) {
      await call("refundOrder", [siteId, orderId, input]);
      need(siteId, "designer", "Ask the owner or a designer to refund orders.");
      const s = of(siteId);
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) throw notFound("That order");
      const refundable = ["paid", "partially_refunded", "out_of_stock"];
      if (!refundable.includes(o.status))
        throw new HubError(409, "not_refundable", "This order can't be refunded.");
      const rest = o.total - o.refunded;
      // Sold-out orders are always refunded in full.
      const amount = o.status === "out_of_stock" ? rest : (input.amount ?? rest);
      if (!Number.isInteger(amount) || amount <= 0 || amount > rest)
        throw new HubError(
          422,
          "invalid_amount",
          "Refund between 0.01 and what's left on the order.",
        );
      o.refunded += amount;
      o.status = o.refunded >= o.total ? "refunded" : "partially_refunded";
      o.problem = null;
      if (o.status === "refunded" && input.restock)
        for (const it of o.items) {
          const inv = s.inventory[it.sku];
          if (inv && inv.qty !== null) inv.qty += it.qty;
        }
      return clone(o);
    },
    packingSlipUrl(siteId, orderId) {
      return `about:blank#packing-slip-${siteId}-${orderId}`;
    },
    async getPackingSlip(siteId, orderId) {
      await call("getPackingSlip", [siteId, orderId]);
      const o = of(siteId).orders.find((x) => x.id === orderId);
      if (!o) throw notFound("That order");
      const esc = (v: unknown) =>
        String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      const addr =
        o.shipping && typeof o.shipping.address === "object"
          ? Object.values(o.shipping.address).filter(Boolean).map(esc).join("<br>")
          : esc(o.shipping?.address);
      return `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip #${o.number}</title><style>body{font:14px system-ui;margin:40px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><h1>Packing slip — order #${o.number}</h1><p><strong>${esc(o.shipping?.name ?? o.customerName)}</strong><br>${addr}</p><table><tr><th>Item</th><th>SKU</th><th>Qty</th></tr>${o.items
        .map((it) => `<tr><td>${esc(it.title)}</td><td>${esc(it.sku)}</td><td>${it.qty}</td></tr>`)
        .join("")}</table></body></html>`;
    },

    async listDiscounts(siteId) {
      await call("listDiscounts", [siteId]);
      return clone(of(siteId).discounts);
    },
    async createDiscount(siteId, input) {
      await call("createDiscount", [siteId, input]);
      need(siteId, "designer", "Ask the owner or a designer to create codes.");
      const code = input.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code))
        throw new HubError(
          422,
          "invalid_code",
          "Use 3–40 letters, numbers, dashes or underscores.",
        );
      const hasPct = input.percentOff !== undefined;
      const hasAmt = input.amountOff !== undefined;
      if (hasPct === hasAmt)
        throw new HubError(422, "invalid_discount", "Choose a percentage or a fixed amount.");
      const pct = input.percentOff ?? 0;
      if (hasPct && !(pct > 0 && pct <= 100))
        throw new HubError(422, "invalid_discount", "Percent off must be between 1 and 100.");
      const s = of(siteId);
      if (s.discounts.some((d) => d.code === code))
        throw new HubError(409, "code_taken", `${code} is already a code.`);
      const d: DiscountCode = {
        id: `dsc_${now().toString(36)}${s.discounts.length}`,
        code,
        percentOff: input.percentOff ?? null,
        amountOff: input.amountOff ?? null,
        currency: hasAmt ? (input.currency ?? s.commerce.currency) : null,
        maxRedemptions: input.maxRedemptions ?? null,
        expiresAt: input.expiresAt ?? null,
        active: true,
        createdAt: iso(now()),
      };
      s.discounts.push(d);
      return clone(d);
    },
    async setDiscountActive(siteId, discountId, active) {
      await call("setDiscountActive", [siteId, discountId, active]);
      const d = of(siteId).discounts.find((x) => x.id === discountId);
      if (!d) throw notFound("That code");
      d.active = active;
      return clone(d);
    },

    // --------------------------------------------------------------------------- members ----
    async listMembers(siteId, query = {}) {
      await call("listMembers", [siteId, query]);
      need(siteId, "editor", "Editors and above can see members.");
      const all = of(siteId)
        .members.filter(
          (m) => !query.tier || (query.tier === "free" ? !m.tier : m.tier === query.tier),
        )
        .filter((m) => !query.status || m.status === query.status)
        .filter((m) => matchesQ(query.q, m.email, m.name))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const { slice, next } = page(all, query.limit ?? 50, query.cursor);
      return { members: clone(slice), total: all.length, nextCursor: next };
    },
    async addMember(siteId, input) {
      await call("addMember", [siteId, input]);
      const s = of(siteId);
      const email = input.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new HubError(422, "invalid_fields", "That email address doesn't look right.");
      if (s.members.some((m) => m.email === email))
        throw new HubError(409, "member_exists", "That person is already a member.");
      const m: Member = {
        id: `mem_${now().toString(36)}${s.members.length}`,
        email,
        name: input.name?.trim() || null,
        tier: input.tier ?? null,
        status: "active",
        source: "added",
        paid: false,
        createdAt: iso(now()),
        lastLoginAt: null,
      };
      s.members.push(m);
      return { member: clone(m), invited: Boolean(input.invite) };
    },
    async updateMember(siteId, memberId, patch) {
      await call("updateMember", [siteId, memberId, patch]);
      const m = of(siteId).members.find((x) => x.id === memberId);
      if (!m) throw notFound("That member");
      if (patch.name !== undefined) m.name = patch.name || null;
      if (patch.tier !== undefined) m.tier = patch.tier;
      if (patch.status) m.status = patch.status;
      return clone(m);
    },
    async deleteMember(siteId, memberId) {
      await call("deleteMember", [siteId, memberId]);
      need(siteId, "designer", "Ask the owner or a designer to remove members.");
      const s = of(siteId);
      s.members = s.members.filter((m) => m.id !== memberId);
    },
    async listTiers(siteId) {
      await call("listTiers", [siteId]);
      const s = of(siteId);
      return clone(
        s.tiers
          .map((t) => ({ ...t, members: s.members.filter((m) => m.tier === t.id).length }))
          .sort((a, b) => a.position - b.position),
      );
    },
    async createTier(siteId, input) {
      await call("createTier", [siteId, input]);
      need(siteId, "designer", "Ask the owner or a designer to change tiers.");
      if (!input.name.trim()) throw new HubError(422, "invalid_tier", "Give the tier a name.");
      if (input.price && input.price.amount < 50)
        throw new HubError(422, "invalid_tier", "Paid tiers cost at least 0.50.");
      const s = of(siteId);
      const t: MemberTier = {
        id: `tier_${now().toString(36)}${s.tiers.length}`,
        name: input.name.trim(),
        description: input.description ?? null,
        price: input.price ?? null,
        active: input.active ?? true,
        position: input.position ?? s.tiers.length,
        members: 0,
      };
      s.tiers.push(t);
      return clone(t);
    },
    async updateTier(siteId, tierId, input) {
      await call("updateTier", [siteId, tierId, input]);
      need(siteId, "designer", "Ask the owner or a designer to change tiers.");
      const t = of(siteId).tiers.find((x) => x.id === tierId);
      if (!t) throw notFound("That tier");
      if (input.price && input.price.amount < 50)
        throw new HubError(422, "invalid_tier", "Paid tiers cost at least 0.50.");
      Object.assign(t, {
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      });
      return clone(t);
    },
    async deleteTier(siteId, tierId) {
      await call("deleteTier", [siteId, tierId]);
      need(siteId, "designer", "Ask the owner or a designer to change tiers.");
      const s = of(siteId);
      if (s.members.some((m) => m.tier === tierId))
        throw new HubError(409, "tier_in_use", "Move this tier's members to another tier first.");
      s.tiers = s.tiers.filter((t) => t.id !== tierId);
    },

    // --------------------------------------------------------------------------- senders ----
    async listSenders(siteId) {
      await call("listSenders", [siteId]);
      need(siteId, "designer", "Ask the owner or a designer about email sending.");
      return of(siteId).senders.map(({ verifyAttempts: _v, ...s }) => clone(s));
    },
    async createSender(siteId, input) {
      await call("createSender", [
        siteId,
        {
          ...input,
          credentials: "[sealed]",
          webhookSecret: input.webhookSecret ? "[sealed]" : undefined,
        },
      ]);
      need(siteId, "owner", "Only the owner can connect an email sender.");
      // Same body rules as the Hub (`SenderInputSchema`): strict, provider-specific credentials.
      const parsed = SenderInputSchema.safeParse(input);
      if (!parsed.success) throw new HubError(400, "invalid_request", firstIssue(parsed.error));
      const email = parsed.data.fromEmail;
      const s = of(siteId);
      const sender: GrowthSiteState["senders"][number] = {
        id: `snd_${now().toString(36)}${s.senders.length}`,
        provider: input.provider,
        fromEmail: email,
        fromName: input.fromName ?? null,
        replyTo: input.replyTo ?? null,
        domain: email.split("@")[1] as string,
        dkimSelector: input.dkimSelector ?? null,
        status: "unverified",
        checks: [],
        verifiedAt: null,
        checkedAt: null,
        webhookUrl: null,
        verifyAttempts: 0,
      };
      s.senders.push(sender);
      const { verifyAttempts: _v, ...out } = sender;
      return {
        ...clone(out),
        webhookUrl: `https://hub.openspace.dev/e/webhooks/${input.provider}/${sender.id}?token=once-${sender.id}`,
      };
    },
    async verifySender(siteId, senderId) {
      await call("verifySender", [siteId, senderId]);
      const sender = of(siteId).senders.find((x) => x.id === senderId);
      if (!sender) throw notFound("That sender");
      sender.verifyAttempts++;
      // Reserved test names resolve at once; real domains need a second check (DNS takes time).
      const ok =
        /\.(test|example|localhost|invalid)$/.test(sender.domain) || sender.verifyAttempts > 1;
      sender.checks = dnsChecks(sender, ok);
      sender.status = ok ? "verified" : "failed";
      sender.checkedAt = iso(now());
      if (ok) sender.verifiedAt ??= sender.checkedAt;
      const { verifyAttempts: _v, ...out } = sender;
      return clone(out);
    },
    async deleteSender(siteId, senderId) {
      await call("deleteSender", [siteId, senderId]);
      need(siteId, "owner", "Only the owner can remove a sender.");
      const s = of(siteId);
      if (
        s.campaigns.some(
          (c) => c.senderId === senderId && (c.status === "scheduled" || c.status === "sending"),
        )
      )
        throw new HubError(409, "sender_in_use", "A scheduled email uses this sender.");
      s.senders = s.senders.filter((x) => x.id !== senderId);
    },

    // ------------------------------------------------------------------------- campaigns ----
    async countSegment(siteId, segment) {
      await call("countSegment", [siteId, segment]);
      return segmentCount(siteId, segment);
    },
    async listCampaigns(siteId) {
      await call("listCampaigns", [siteId]);
      need(siteId, "editor", "Editors and above can see emails.");
      return of(siteId)
        .campaigns.map(view)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async createCampaign(siteId, input) {
      await call("createCampaign", [siteId, input]);
      need(siteId, "editor", "Editors and above can write emails.");
      const parsed = CampaignInputSchema.safeParse(input);
      if (!parsed.success) throw new HubError(400, "invalid_request", firstIssue(parsed.error));
      const s = of(siteId);
      const at = iso(now());
      const c: GrowthSiteState["campaigns"][number] = {
        id: `cmp_${now().toString(36)}${s.campaigns.length}`,
        subject: input.subject,
        preheader: input.preheader ?? null,
        body: clone(input.body),
        segment: input.segment ?? { tags: [], match: "any" },
        senderId: input.senderId ?? s.senders.find((x) => x.status === "verified")?.id ?? null,
        trackOpens: input.trackOpens ?? false,
        status: "draft",
        sendAt: null,
        recipients: 0,
        error: null,
        createdAt: at,
        updatedAt: at,
        startedAt: null,
        finishedAt: null,
        stats: null,
      };
      s.campaigns.push(c);
      return view(c);
    },
    async getCampaignLimits(siteId) {
      await call("getCampaignLimits", [siteId]);
      const today = iso(now()).slice(0, 10);
      const sentToday = of(siteId)
        .campaigns.filter((c) => (c.startedAt ?? "").slice(0, 10) === today)
        .reduce((n, c) => n + c.recipients, 0);
      const limit = 100;
      return {
        limit,
        sentToday,
        remaining: Math.max(0, limit - sentToday),
        cleanDays: 0,
        window: { sent: sentToday, bounced: 0, complained: 0 },
        paused: null,
        abuseEmail: "abuse@openspace.dev",
      };
    },
    async getCampaign(siteId, campaignId) {
      await call("getCampaign", [siteId, campaignId]);
      const c = campaignOf(siteId, campaignId);
      return { campaign: view(c), stats: clone(c.stats) };
    },
    async updateCampaign(siteId, campaignId, patch) {
      await call("updateCampaign", [siteId, campaignId, patch]);
      const c = campaignOf(siteId, campaignId);
      const parsed = CampaignPatchSchema.safeParse(patch);
      if (!parsed.success) throw new HubError(400, "invalid_request", firstIssue(parsed.error));
      if (c.status !== "draft")
        throw new HubError(409, "not_editable", "Only drafts can be changed. Unschedule it first.");
      const p = parsed.data;
      if (p.subject !== undefined) c.subject = p.subject;
      if (p.preheader !== undefined) c.preheader = p.preheader ?? null;
      if (p.body) c.body = clone(p.body) as typeof c.body;
      if (p.segment) c.segment = clone(p.segment);
      if (p.senderId !== undefined) c.senderId = p.senderId ?? null;
      if (p.trackOpens !== undefined) c.trackOpens = p.trackOpens;
      c.updatedAt = iso(now());
      return view(c);
    },
    async deleteCampaign(siteId, campaignId) {
      await call("deleteCampaign", [siteId, campaignId]);
      const c = campaignOf(siteId, campaignId);
      if (!["draft", "scheduled", "canceled"].includes(c.status))
        throw new HubError(409, "not_deletable", "Sent emails stay in your history.");
      const s = of(siteId);
      s.campaigns = s.campaigns.filter((x) => x.id !== campaignId);
    },
    async previewCampaign(siteId, campaignId) {
      await call("previewCampaign", [siteId, campaignId]);
      const site = findSite(siteId);
      const c = campaignOf(siteId, campaignId);
      const doc = ctx.docOf(site);
      const r = campaignEmail({
        site: doc.site,
        styles: doc.styles,
        baseUrl: site.url,
        subject: c.subject,
        preheader: c.preheader ?? undefined,
        blocks: c.body.blocks,
        unsubscribeUrl: { mergeTag: "{{os_unsubscribe}}" },
      });
      return {
        subject: r.subject,
        html: r.html,
        text: r.text,
        warnings: r.warnings.map((w) => w.message),
        recipients: segmentCount(siteId, c.segment),
      };
    },
    async testCampaign(siteId, campaignId, to) {
      await call("testCampaign", [siteId, campaignId, to]);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
        throw new HubError(422, "invalid_fields", "Enter an email address for the test.");
      const c = campaignOf(siteId, campaignId);
      const s = of(siteId);
      if (!s.senders.length)
        throw new HubError(409, "sender_required", "Connect an email sender before sending.");
      s.outbox.push({ to, subject: `[Test] ${c.subject}`, kind: "campaign-test" });
    },
    async scheduleCampaign(siteId, campaignId, sendAt) {
      await call("scheduleCampaign", [siteId, campaignId, sendAt]);
      need(siteId, "designer", "Ask the owner or a designer to send emails.");
      const c = campaignOf(siteId, campaignId);
      requireSendable(siteId, view(c));
      const at = Date.parse(sendAt);
      if (!Number.isFinite(at) || at < now() + 60_000)
        throw new HubError(422, "invalid_time", "Pick a time at least a minute from now.");
      c.status = "scheduled";
      c.sendAt = new Date(at).toISOString();
      c.updatedAt = iso(now());
      return view(c);
    },
    async unscheduleCampaign(siteId, campaignId) {
      await call("unscheduleCampaign", [siteId, campaignId]);
      need(siteId, "designer", "Ask the owner or a designer to change sending.");
      const c = campaignOf(siteId, campaignId);
      if (c.status !== "scheduled")
        throw new HubError(409, "not_scheduled", "This email isn't scheduled.");
      c.status = "draft";
      c.sendAt = null;
      return view(c);
    },
    async sendCampaign(siteId, campaignId) {
      await call("sendCampaign", [siteId, campaignId]);
      need(siteId, "designer", "Ask the owner or a designer to send emails.");
      const c = campaignOf(siteId, campaignId);
      requireSendable(siteId, view(c));
      sendNow(siteId, c);
      return view(c);
    },
    async getCampaignStats(siteId, campaignId) {
      await call("getCampaignStats", [siteId, campaignId]);
      const c = campaignOf(siteId, campaignId);
      if (!c.stats) throw new HubError(409, "not_sent", "Stats appear once the email is sent.");
      return clone(c.stats);
    },
  };

  return { api, overrides: approvalsOverride, state, onRoomOp };
}
