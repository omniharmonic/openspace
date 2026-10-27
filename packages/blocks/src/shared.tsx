import {
  Button,
  cx,
  resolveImage,
  useImageMap,
  useRenderContext,
} from "@omniharmonic/openspace-renderer";
import {
  type BlockStyle,
  f,
  type HeadingPreset,
  type ImageValue,
  type InlineNode,
  type Link as LinkValue,
  type ParagraphPreset,
  type RichTextDoc,
  type TypePreset,
} from "@omniharmonic/openspace-schema";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/** Helpers shared by the block library. */

// --- rich text builders (defaults and tests) ----------------------------------------------------

export type Inline = string | InlineNode;
const inline = (parts: Inline[]): InlineNode[] =>
  parts.map((p) => (typeof p === "string" ? { type: "text", text: p } : p));

export const rt = {
  doc: (...content: RichTextDoc["content"]): RichTextDoc => ({ type: "doc", content }),
  p: (text: Inline | Inline[], preset?: ParagraphPreset): RichTextDoc["content"][number] => ({
    type: "paragraph",
    ...(preset ? { attrs: { preset } } : {}),
    content: inline(Array.isArray(text) ? text : [text]),
  }),
  h: (
    level: 1 | 2 | 3 | 4,
    text: string,
    preset?: HeadingPreset,
  ): RichTextDoc["content"][number] => ({
    type: "heading",
    attrs: preset ? { level, preset } : { level },
    content: [{ type: "text", text }],
  }),
  ul: (...items: string[]): RichTextDoc["content"][number] => ({
    type: "bulletList",
    content: items.map((text) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  }),
  bold: (text: string): InlineNode => ({ type: "text", text, marks: [{ type: "bold" }] }),
  italic: (text: string): InlineNode => ({ type: "text", text, marks: [{ type: "italic" }] }),
  link: (text: string, href: string): InlineNode => ({
    type: "text",
    text,
    marks: [{ type: "link", attrs: { href } }],
  }),
};

// --- style helpers ------------------------------------------------------------------------------

/** Class for a block's `typography.<slot>` override, else the given default preset. */
export function typo(style: BlockStyle | undefined, slot: string, fallback: TypePreset): string {
  return `os-type-${style?.typography?.[slot] ?? fallback}`;
}

// --- shared field builders ------------------------------------------------------------------------

export const ASPECT_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "1:1", label: "Square 1:1" },
  { value: "4:5", label: "Portrait 4:5" },
  { value: "2:3", label: "Tall 2:3" },
  { value: "3:2", label: "Landscape 3:2" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "21:9", label: "Cinematic 21:9" },
] as const;
export type AspectOption = (typeof ASPECT_OPTIONS)[number]["value"];

export const aspectField = (fallback: AspectOption, help = "Crop shape for the image") =>
  f.select({ options: ASPECT_OPTIONS, default: fallback, label: "Aspect ratio", help });

// --- hub / site helpers ---------------------------------------------------------------------------

/** Hub origin + site id for public endpoints (`/f/…`, `/n/…`). */
export function useHub(): { hub: string; siteId: string } {
  const ctx = useRenderContext();
  const hub = (ctx.hubUrl ?? ctx.doc?.config.hub ?? "").replace(/\/+$/, "");
  return { hub, siteId: ctx.doc?.config.siteId ?? "" };
}

/** The owner's contact email, from the site's `email` social profile (used in form fallbacks). */
export function useOwnerEmail(): string | undefined {
  const { doc } = useRenderContext();
  const profile = doc?.site.social?.find((s) => s.network === "email");
  return profile?.url.replace(/^mailto:/, "") || undefined;
}

/** Full-size URL of an image (lightbox targets, share images). */
export function useImageUrl(): (image: ImageValue) => string {
  const ctx = useRenderContext();
  const imageMap = useImageMap();
  return (image) =>
    resolveImage(image.src, {
      imageMap,
      doc: ctx.doc,
      basePath: ctx.basePath,
      width: image.width,
      height: image.height,
    }).src;
}

/** `blk_abc` + `q1` → `blk_abc-q1` (stable element ids inside a block). */
/**
 * Columns for `n` items when at most `max` fit a row: as few rows as possible, then as even as
 * possible — 6 logos with room for 5 become 3 + 3 (never 5 + 1), 4 posts in a 3-column wall
 * become 2 + 2 (never 2 + 2 + an empty column).
 */
export function balancedColumns(n: number, max: number): number {
  if (n <= max) return Math.max(1, n);
  return Math.ceil(n / Math.ceil(n / max));
}

export const sub = (id: string, part: string | number) => `${id}-${part}`;

// --- demo photography (Unsplash; real photographs, licensed for free use) ----------------------

const unsplash = (id: string, alt: string, width: number, height: number): ImageValue => ({
  src: `https://images.unsplash.com/photo-${id}?w=2400&q=80`,
  alt,
  width,
  height,
});

export const DEMO = {
  yogaDeck: unsplash(
    "1506126613408-eca07ce68773",
    "A woman meditating cross-legged on a wooden deck at sunrise",
    2400,
    2796,
  ),
  hills: unsplash(
    "1501854140801-50d01698950b",
    "Rolling green hills seen from above, ridges catching the light",
    2400,
    1428,
  ),
  forest: unsplash(
    "1441974231531-c6227db76b6e",
    "Sunlight falling through tall trees onto a forest path",
    2400,
    1600,
  ),
  cliffs: unsplash(
    "1470071459604-3b5ec3a7fe05",
    "Mist rolling over green cliffs at sunrise",
    2400,
    1428,
  ),
  coffeeCheers: unsplash(
    "1495474472287-4d71bcdd2085",
    "Four friends raising lattes over a wooden table",
    2400,
    1600,
  ),
  dining: unsplash(
    "1517248135467-4c7edcad34c4",
    "A warm, dimly lit restaurant dining room before service",
    2400,
    1600,
  ),
  dinner: unsplash(
    "1414235077428-338989a2e8c0",
    "A plated dish on a candlelit dinner table set for friends",
    2400,
    1600,
  ),
  portraitLake: unsplash(
    "1438761681033-6461ffad8d80",
    "Portrait of a woman with short auburn hair beside a lake",
    2400,
    1600,
  ),
  portraitDaniel: unsplash(
    "1500648767791-00dcc994a43e",
    "Portrait of a man in a grey sweater, smiling softly",
    1600,
    2400,
  ),
  portraitAna: unsplash(
    "1494790108377-be9c29b29330",
    "Portrait of a woman in a red sweater, laughing",
    1600,
    2400,
  ),
  portraitSam: unsplash(
    "1507003211169-0a1dd7228f2d",
    "Portrait of a smiling man in a white t-shirt",
    1600,
    2400,
  ),
  pilates: unsplash(
    "1518611012118-696072aa579a",
    "Two women stretching on mats in a bright studio",
    2400,
    1600,
  ),
  poppies: unsplash(
    "1490750967868-88aa4486c946",
    "Orange poppies against a clear blue sky",
    2400,
    1600,
  ),
  beachPose: unsplash(
    "1544367567-0f2fcb009e0b",
    "A person holding a yoga pose on the beach at dusk",
    2400,
    1512,
  ),
  beachClass: unsplash(
    "1545205597-3d9d02c29597",
    "A small group practising yoga together on a misty beach",
    2400,
    1600,
  ),
  bridge: unsplash(
    "1447752875215-b2761acb3c5d",
    "A wooden footbridge leading into a dense green forest",
    2400,
    1600,
  ),
  meadow: unsplash(
    "1465146344425-f00d5f5c8f07",
    "Wild red poppies scattered through a summer meadow",
    2400,
    1584,
  ),
  coffeeTable: unsplash(
    "1509042239860-f550ce710b93",
    "Two cappuccinos with latte art beside potted herbs",
    1600,
    2400,
  ),
  skincare: unsplash(
    "1556228578-8c89e6adf883",
    "A skincare tube resting on sand among dried flowers",
    1600,
    2400,
  ),
  livingRoom: unsplash(
    "1524758631624-e2822e304c36",
    "A bright, airy lounge with pale chairs and a reading lamp",
    2400,
    1600,
  ),
} as const;

// --- locale, money and dates ----------------------------------------------------------------------

/** The site's locale (BCP 47), `en-US` when rendering without a site. */
export function useLocale(): string {
  return useRenderContext().doc?.site.locale ?? "en-US";
}

/** Digits after the decimal point for a currency (USD 2, JPY 0, KWD 3). */
export function currencyExponent(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Format minor units (`6800` USD) as display money (`$68`, or `$68.50`). */
export function formatMoney(
  minor: number,
  currency: string,
  locale: string,
  opts: { trimZeros?: boolean } = {},
): string {
  const exp = currencyExponent(currency);
  const major = minor / 10 ** exp;
  const whole = Number.isInteger(major);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(opts.trimZeros !== false && whole ? { minimumFractionDigits: 0 } : {}),
    }).format(major);
  } catch {
    return `${major.toFixed(exp)} ${currency}`;
  }
}

const OFFSET_RE = /([+-]\d{2}:\d{2})$/;

/** Is this an ISO date without a time (`2026-11-14`)? */
export const isDateOnly = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);

/**
 * Format an ISO date or date-time in a fixed zone so static output never depends on the build
 * machine: date-only values in UTC, date-times in `timeZone`, else their own offset.
 */
export function formatDate(
  iso: string,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const zone = isDateOnly(iso) ? "UTC" : (timeZone ?? iso.match(OFFSET_RE)?.[1] ?? "UTC");
  for (const tz of [zone, "UTC"]) {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(date);
    } catch {
      /* unsupported zone: fall back to UTC */
    }
  }
  return iso;
}

/** Calendar parts (`year`, `month` 1–12, `day`) of an ISO value in its own zone (see formatDate). */
export function dateParts(iso: string, timeZone?: string) {
  const zone = isDateOnly(iso) ? "UTC" : (timeZone ?? iso.match(OFFSET_RE)?.[1] ?? "UTC");
  const date = new Date(iso);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// --- editing notices ----------------------------------------------------------------------------

/**
 * A short notice for owners (Studio canvas and previews). Production renders nothing, so a
 * half-configured block never shows instructions to visitors.
 */
/**
 * Whether the site's hosting can run checkout (shop, donations) and member sign-in. They need the
 * Cloudflare hosting option: on GitHub Pages the Hub has no site server to hand visitors back
 * to, so these blocks render an honest, non-interactive state instead of a button that ends on
 * an error page (Studio warns the owner too). Renders without a document assume they can.
 */
export function useSiteServer(): boolean {
  const { doc } = useRenderContext();
  return !doc || doc.config.deploy.target === "cloudflare";
}

/**
 * Where an owner's current shop or donation page lives until checkout opens here. Schema-free:
 * a redirect in `site.json` from this path (Studio → Finish setting up → "Point to your current
 * shop" adds it). Visitors who type the path are sent there too.
 */
export const ELSEWHERE_PATHS = {
  store: "/shop-elsewhere",
  donations: "/give-elsewhere",
} as const;

export type OpeningSoonKind = "store" | "donations" | "members";

const SOON_COPY: Record<
  OpeningSoonKind,
  { title: string; text: string; elsewhere: string; button: string; icon: IconName }
> = {
  store: {
    title: "Online ordering opens here soon.",
    text: "Have a look around — you'll be able to order right here very soon.",
    elsewhere: "Until then, you can order from our current shop.",
    button: "Order from our current shop",
    icon: "shopping-bag",
  },
  donations: {
    title: "Online giving opens here soon.",
    text: "Thank you for wanting to help — you'll be able to give right here very soon.",
    elsewhere: "Until then, you can give on our current donation page.",
    button: "Give on our current page",
    icon: "hand-heart",
  },
  members: {
    title: "Member sign-in opens here soon.",
    text: "Members will be able to sign in right here very soon.",
    elsewhere: "",
    button: "",
    icon: "key-round",
  },
};

/** The owner's "current shop" address from the site's redirects, if they added one. */
export function useElsewhere(kind: OpeningSoonKind): string | null {
  const { doc } = useRenderContext();
  if (kind === "members") return null;
  const from = ELSEWHERE_PATHS[kind];
  const hit = doc?.site.redirects?.find((r) => r.from.replace(/\/+$/, "") === from);
  return hit?.to ?? null;
}

/**
 * What visitors see in place of a checkout or sign-in form the site's hosting can't run yet: a
 * calm, designed "opening soon" note in the site's own colours and type (no form, nothing that
 * looks broken), optionally linking to the owner's current shop or donation page; plus a note
 * for the owner in Studio.
 */
export function OpeningSoon({
  kind,
  hint,
  compact,
}: {
  kind: OpeningSoonKind;
  hint: ReactNode;
  /** One line, for slim spots (a banner's action row). */
  compact?: boolean;
}) {
  const copy = SOON_COPY[kind];
  const elsewhere = useElsewhere(kind);
  if (compact)
    return (
      <>
        <p className={cx("os-unavailable", "os-soon", "os-soon--compact")}>{copy.title}</p>
        <EditorNotice>{hint}</EditorNotice>
      </>
    );
  return (
    <>
      <div className={cx("os-soon", `os-soon--${kind}`)}>
        <span className="os-soon__mark" aria-hidden="true">
          <Icon name={copy.icon} size={20} />
        </span>
        <div className="os-soon__body">
          <p className="os-unavailable os-soon__title">{copy.title}</p>
          <p className="os-soon__text">{elsewhere ? copy.elsewhere : copy.text}</p>
          {elsewhere ? (
            <Button
              to={{ type: "url", url: elsewhere } as LinkValue}
              role="secondary"
              className="os-soon__link"
            >
              {copy.button}
            </Button>
          ) : null}
        </div>
      </div>
      <EditorNotice>{hint}</EditorNotice>
    </>
  );
}

/** @deprecated Use `OpeningSoon`; kept for blocks that only need the one sentence. */
export function UnavailableNotice({ children, hint }: { children: ReactNode; hint: ReactNode }) {
  return (
    <>
      <p className="os-unavailable">{children}</p>
      <EditorNotice>{hint}</EditorNotice>
    </>
  );
}

export function EditorNotice({ children }: { children: ReactNode }) {
  const { mode } = useRenderContext();
  if (mode === "production") return null;
  return (
    <p className="os-empty" role="note">
      {children}
    </p>
  );
}

// --- carousel controls -----------------------------------------------------------------------------

/**
 * Previous / next buttons for the renderer carousel contract (`[data-os-prev]`,
 * `[data-os-next]`, `aria-controls` → the `.os-carousel__track` id). `noun` names what moves:
 * "photos", "quote", "items".
 */
export function CarouselControls({ trackId, noun }: { trackId: string; noun: string }) {
  return (
    <div className="os-carousel__controls">
      <button
        type="button"
        className="os-carousel__btn"
        data-os-prev=""
        aria-controls={trackId}
        aria-label={`Previous ${noun}`}
      >
        <Icon name="arrow-right" size={20} className="os-flip" />
      </button>
      <button
        type="button"
        className="os-carousel__btn"
        data-os-next=""
        aria-controls={trackId}
        aria-label={`Next ${noun}`}
      >
        <Icon name="arrow-right" size={20} />
      </button>
    </div>
  );
}

// --- heading levels -------------------------------------------------------------------------------

export const HEADING_LEVELS = ["h2", "h3", "h4"] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** The block's own heading level (default h3, under the page's section headings). */
export const headingLevelField = () =>
  f.select({
    options: [
      { value: "h2", label: "Heading 2" },
      { value: "h3", label: "Heading 3" },
      { value: "h4", label: "Heading 4" },
    ],
    default: "h3",
    label: "Heading level",
    help: "Match the page outline: one level below the section's heading",
  });

/** One level below `level` (item titles under the block heading), capped at h5. */
export const childLevel = (level: HeadingLevel) =>
  (({ h2: "h3", h3: "h4", h4: "h5" }) as const)[level];
