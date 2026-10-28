/**
 * "Start with Claude": a third way to begin, beside a template and "Move my site". The person
 * says what the site is for, who it's for and how it should feel, and may bring brand material —
 * a design-token file (Claude Design System, Canva brand kit, Figma/Tokens Studio, W3C tokens),
 * colours, fonts, a logo, photos, a brand document — or a page Claude made for them earlier
 * (an HTML file or a zip).
 *
 * Wow first: a good site goes live straight away on free GitHub Pages — the page they brought
 * made editable (designer components with fields), or else the closest template wearing their
 * brand (palette, fonts, type, spacing; contrast-checked) with their photos in it. Either way the
 * site carries `content/design-system.json` (the brief + tokens), and Claude makes it bespoke
 * from there (Claude app connector or Claude Code).
 */
import {
  bundleFromHtml,
  bundleFromZip,
  confirmGoogleFonts,
  importHtmlBundle,
  isZip,
} from "@omniharmonic/openspace-import/html-bundle";
import {
  CssColorSchema,
  type DesignSystem,
  type DesignTokens,
  type MediaId,
  type MediaMeta,
  newId,
  type SiteDocument,
  type SiteId,
} from "@omniharmonic/openspace-schema";
import {
  designSystemStyles,
  readDesignTokens,
  tokensFromStyles,
} from "@omniharmonic/openspace-theme";
import { z } from "zod";
import { audit } from "../db/audit";
import { getSite, insertSite, type SiteRow, updateSite } from "../db/sites";
import type { User } from "../db/users";
import type { FileContent } from "../github/types";
import { base64ToBytes, bytesToBase64 } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { decodeImageDataUrl } from "../lib/image";
import type { Logger } from "../lib/log";
import { checkInstallation, GITHUB_ACCESS_DETAIL, type GitHubAccessNeed } from "./github-install";
import { placeholderDocument, shellFiles } from "./import-site";
import type { Services } from "./index";
import { siteDocumentToFiles } from "./site-files";
import {
  buildStartFiles,
  getSiteView,
  githubPagesUrl,
  MAX_LOGO_BYTES,
  previewUrl,
  runSetup,
  type SiteSetup,
  type SiteView,
  slugifyRepoName,
  uniqueRepoName,
} from "./sites";
import type { TemplateLook, TemplateMeta } from "./templates";

// --- input ---------------------------------------------------------------------------------------

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_TOKENS_CHARS = 400_000;

const Upload = z.strictObject({
  name: z.string().trim().min(1).max(200),
  /** `data:<mime>;base64,…` */
  data: z.string().min(10),
});

export const StartInputSchema = z.strictObject({
  name: z.string().trim().min(1, "Give your site a name").max(80),
  /** What the business or project is, in their words. */
  about: z.string().trim().max(2000).optional(),
  audience: z.string().trim().max(1000).optional(),
  /** How it should feel ("warm", "calm", "bold"…). */
  feeling: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  notes: z.string().trim().max(2000).optional(),
  /** A design-token file's JSON (text), from a design system, brand kit or Figma. */
  tokens: z.string().max(MAX_TOKENS_CHARS).optional(),
  tokensName: z.string().trim().max(200).optional(),
  colors: z.array(CssColorSchema).max(8).optional(),
  fonts: z
    .strictObject({
      heading: z.string().trim().max(60).optional(),
      body: z.string().trim().max(60).optional(),
    })
    .optional(),
  logo: z.string().max(1_500_000).optional(),
  photos: z.array(Upload).max(8).optional(),
  /** A brand document: text (pasted or a .txt/.md) and/or a file kept in the repository. */
  brandDoc: z
    .strictObject({
      name: z.string().trim().max(200),
      text: z.string().max(20_000).optional(),
      data: z.string().optional(),
    })
    .optional(),
  /** A page Claude made: a single HTML file or a zip of HTML/CSS/images. */
  html: Upload.optional(),
  owner: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "That isn't a GitHub account name")
    .optional(),
});
export type StartInput = z.infer<typeof StartInputSchema>;

/** What a Start-with-Claude site is built from (kept in `setup_json`; uploads live in R2). */
export interface StartSetup {
  brief: NonNullable<DesignSystem["brief"]>;
  tokens?: string;
  tokensName?: string;
  colors?: string[];
  fonts?: { heading?: string; body?: string };
  brandDoc?: { name: string; text?: string; key?: string; mime?: string };
  photos: Array<{ key: string; name: string; mime: string }>;
  html?: { key: string; name: string; zip: boolean };
}

// --- choosing a starting point ------------------------------------------------------------------

/** Words people use → templates that fit them. */
const SYNONYMS: Array<[RegExp, string[]]> = [
  [
    /bak(?:e|ery|er)|caf[eé]|coffee|restaurant|food|kitchen|bistro|bar\b|brew|deli|catering|chef/,
    ["hearth"],
  ],
  [
    /yoga|therap|wellness|massage|bodywork|pilates|meditat|healing|reiki|doula|nutrition|counsel/,
    ["meadow"],
  ],
  [/photo|camera|visual art|painter|illustrat|gallery|artist/, ["atelier", "darkroom"]],
  [/music|band|singer|dj\b|podcast|perform|tour|album|choir/, ["encore"]],
  [/write|writer|author|book|novel|poet|newsletter|essay|blog|journal/, ["inkwell", "field-notes"]],
  [
    /plumb|electric|clean|salon|barber|garage|repair|builder|trade|landscap|handyman|local service/,
    ["fixwell"],
  ],
  [/resume|cv\b|freelanc|personal site|about me|job/, ["folio"]],
  [/event|festival|conference|summit|meetup|workshop series/, ["gather"]],
  [/nonprofit|non-profit|charity|donat|volunteer|foundation|campaign/, ["beacon", "harbor"]],
  [/community|neighbo|church|club|association|parish/, ["harbor", "commons"]],
  [/co-?op|cooperative|coalition|movement|collective|union/, ["commons"]],
  [
    /coach|consult|advis|leadership|strategy|therapist practice|mentor|speaker/,
    ["keystone", "ledger"],
  ],
  [/ceramic|pottery|maker|handmade|craft|shop|store|candle|jewel|knit|studio goods/, ["kiln"]],
  [/link in bio|creator|influencer|single page|socials/, ["link"]],
  [/saas|app\b|software|startup|product launch|platform|developer|api\b/, ["orbit", "signal"]],
  [/wedding|marriage|engage|celebrat|rsvp|anniversar/, ["vow"]],
];

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ'-]+/)
    .filter((w) => w.length > 2);

/** The closest template to what they described (and a look that fits how it should feel). */
export function pickTemplate(
  templates: readonly TemplateMeta[],
  input: Pick<StartInput, "about" | "audience" | "feeling" | "notes" | "name">,
): { template: TemplateMeta; look: TemplateLook; why: string } {
  const text = [input.about, input.audience, input.notes, input.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const ws = new Set(words(text));
  const scores = new Map<string, number>();
  for (const t of templates) {
    const tags = ((t as { tags?: string[] }).tags ?? []).map((x) => x.toLowerCase());
    let s = 0;
    for (const tag of tags) if (text.includes(tag)) s += 3;
    for (const w of words(`${t.persona} ${t.description}`)) if (ws.has(w)) s += 1;
    scores.set(t.id, s);
  }
  for (const [re, ids] of SYNONYMS)
    if (re.test(text))
      for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + 6 - ids.indexOf(id));
  const ranked = [...templates].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  const fallback =
    templates.find((t) => t.id === "folio") ?? templates.find((t) => t.id === "keystone");
  const best = (scores.get(ranked[0]?.id ?? "") ?? 0) > 0 ? ranked[0] : (fallback ?? ranked[0]);
  if (!best) throw new HttpError(500, "no_templates", "No templates are available.");
  const look = pickLook(best, input.feeling ?? []);
  return {
    template: best,
    look,
    why:
      (scores.get(best.id) ?? 0) > 0
        ? `closest to what you described (${best.persona.toLowerCase()})`
        : "a calm, flexible starting point",
  };
}

const FEELINGS: Array<[RegExp, (l: TemplateLook) => number]> = [
  [
    /calm|quiet|serene|peace|gentle|soft|airy/,
    (l) =>
      (l.styles.choices.density === "airy" ? 2 : 0) +
      (l.styles.choices.motion !== "expressive" ? 1 : 0),
  ],
  [
    /bold|energ|vibrant|loud|playful|fun|bright/,
    (l) =>
      (l.styles.choices.motion === "expressive" ? 2 : 0) +
      (/pill/.test(l.styles.choices.buttons) ? 1 : 0),
  ],
  [
    /elegan|refined|luxur|premium|classic|timeless/,
    (l) =>
      (l.styles.choices.shape === "sharp" ? 2 : 0) +
      (/outline|underline/.test(l.styles.choices.buttons) ? 1 : 0),
  ],
  [
    /warm|cosy|cozy|friendly|welcom|homely/,
    (l) =>
      (l.styles.choices.palette.neutral === "warm" ? 2 : 0) +
      (l.styles.choices.shape !== "sharp" ? 1 : 0),
  ],
  [
    /modern|clean|minimal|crisp|simple/,
    (l) =>
      (l.styles.choices.palette.neutral !== "warm" ? 1 : 0) +
      (l.styles.choices.shape === "sharp" ? 1 : 0),
  ],
  [
    /dark|moody|night|dramatic/,
    (l) => (/noir|night|dark|black|charcoal|chrome/.test(l.id) ? 3 : 0),
  ],
];

function pickLook(t: TemplateMeta, feeling: string[]): TemplateLook {
  const f = feeling.join(" ").toLowerCase();
  let best = t.looks[0] as TemplateLook;
  let bestScore = -1;
  for (const l of t.looks) {
    let s = 0;
    for (const [re, score] of FEELINGS) if (re.test(f)) s += score(l);
    if (s > bestScore) {
      best = l;
      bestScore = s;
    }
  }
  return best;
}

// --- brand → tokens ---------------------------------------------------------------------------------

function brandTokens(setup: StartSetup): {
  tokens?: DesignTokens;
  notes: string[];
  rules: string[];
  format?: string;
} {
  const notes: string[] = [];
  let tokens: DesignTokens | undefined;
  let rules: string[] = [];
  let format: string | undefined;
  if (setup.tokens) {
    const r = readDesignTokens(setup.tokens);
    tokens = r.tokens;
    notes.push(...r.notes);
    rules = r.rules;
    format = r.format;
  }
  if (setup.colors?.length) {
    const named: Record<string, string> = {};
    setup.colors.forEach((c, i) => {
      named[i === 0 ? "brand" : `colour-${i + 1}`] = c;
    });
    const r = readDesignTokens({ color: named });
    tokens = {
      ...(tokens ?? {}),
      colors: { ...(r.tokens.colors ?? {}), ...(tokens?.colors ?? {}) },
    };
    if (!tokens.colors?.brand && r.tokens.colors?.brand)
      tokens.colors = { ...tokens.colors, brand: { ...r.tokens.colors.brand, role: "brand" } };
  }
  if (setup.fonts?.heading || setup.fonts?.body) {
    tokens = {
      ...(tokens ?? {}),
      fonts: {
        ...(tokens?.fonts ?? {}),
        ...(setup.fonts.heading ? { heading: { family: setup.fonts.heading } } : {}),
        ...(setup.fonts.body ? { body: { family: setup.fonts.body } } : {}),
      },
    };
  }
  return { ...(tokens ? { tokens } : {}), notes, rules, ...(format ? { format } : {}) };
}

// --- files -------------------------------------------------------------------------------------------

const ymPath = (now: number) => {
  const d = new Date(now);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

async function r2Bytes(services: Services, key: string): Promise<Uint8Array> {
  const obj = await services.uploads.get(key);
  if (!obj) throw new Error(`Upload ${key} is missing from storage`);
  return new Uint8Array(await obj.arrayBuffer());
}

/** Swap the template's own pictures on the home page for the person's photos (in order). */
function placePhotos(
  doc: SiteDocument,
  photos: Array<{ src: string; width: number; height: number; alt: string; mediaId: MediaId }>,
): number {
  const home = Object.values(doc.pages).find((p) => p.slug === "");
  if (!home || !photos.length) return 0;
  let i = 0;
  const visit = (v: unknown): void => {
    if (i >= photos.length || !v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    const o = v as Record<string, unknown>;
    if (
      typeof o.src === "string" &&
      (/^media\/.*\.(?:jpe?g|png|webp|avif)$/i.test(o.src) ||
        /^https:\/\/(?:images\.unsplash\.com|images\.pexels\.com)\//.test(o.src) ||
        /^https:\/\/.*\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(o.src))
    ) {
      const p = photos[i++] as (typeof photos)[number];
      o.src = p.src;
      o.alt = p.alt;
      o.width = p.width;
      o.height = p.height;
      o.mediaId = p.mediaId;
      delete o.focal;
      return;
    }
    for (const x of Object.values(o)) visit(x);
  };
  visit(home.sections);
  return i;
}

/**
 * The template route: the personalized template document (already built by the caller) wearing
 * the person's brand, with their photos placed and the design-system record.
 */
export async function applyStart(
  services: Services,
  setup: SiteSetup & { start: StartSetup },
  input: { doc: SiteDocument; templateName: string; why?: string },
): Promise<{ doc: SiteDocument; files: Record<string, string | FileContent> }> {
  const start = setup.start;
  let doc = structuredClone(input.doc);
  const files: Record<string, string | FileContent> = {};
  const notes: string[] = [];
  const { tokens: brand, notes: tokenNotes, rules, format } = brandTokens(start);
  notes.push(...tokenNotes);
  let contrast: NonNullable<DesignSystem["mapping"]>["contrast"] = [];
  if (brand) {
    const families = Object.values(brand.fonts ?? {})
      .map((f) => f?.family)
      .filter((f): f is string => !!f);
    const google = new Set(
      families.length
        ? await confirmGoogleFonts(families, services.fetch as typeof fetch).catch(() => [])
        : [],
    );
    for (const f of Object.values(brand.fonts ?? {}))
      if (f && google.has(f.family.toLowerCase())) f.google = true;
    const mapped = designSystemStyles(brand, doc.styles, {
      isGoogleFont: (f) => google.has(f.toLowerCase()),
    });
    doc = { ...doc, styles: mapped.styles };
    notes.push(...mapped.notes);
    contrast = mapped.contrast;
  }
  // Photos.
  const placed: Array<{
    src: string;
    width: number;
    height: number;
    alt: string;
    mediaId: MediaId;
  }> = [];
  for (const p of start.photos) {
    const bytes = await r2Bytes(services, p.key);
    let img: ReturnType<typeof decodeImageDataUrl>;
    try {
      img = decodeImageDataUrl(`data:${p.mime};base64,${bytesToBase64(bytes)}`, MAX_PHOTO_BYTES);
    } catch {
      continue;
    }
    const mediaId = newId("med") as MediaId;
    const stem =
      p.name
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "photo";
    const path = `media/${ymPath(setup.createdAt)}/${stem}-${mediaId.slice(4, 10)}.${img.ext}`;
    files[path] = { content: img.base64, encoding: "base64" };
    const alt = stem.replace(/-/g, " ");
    doc.media[path as keyof typeof doc.media] = {
      id: mediaId,
      path,
      kind: "image",
      mime: img.mime,
      bytes: img.bytes,
      width: img.width,
      height: img.height,
      alt,
      createdAt: new Date(setup.createdAt).toISOString(),
    } as MediaMeta;
    placed.push({ src: path, width: img.width, height: img.height, alt, mediaId });
  }
  const used = placePhotos(doc, placed);
  if (placed.length)
    notes.push(
      `${placed.length} of your photo${placed.length === 1 ? "" : "s"} added${used ? ` (${used} on the home page)` : ""}.`,
    );
  // Brand document: its words in the record; a PDF kept in the repository (not published).
  let documents: Array<{ name: string; path: string }> | undefined;
  if (start.brandDoc?.key) {
    const bytes = await r2Bytes(services, start.brandDoc.key);
    const name = start.brandDoc.name.replace(/[^\w.-]+/g, "-").slice(0, 80) || "brand-document";
    const path = `brand/${name}`;
    files[path] = { content: bytesToBase64(bytes), encoding: "base64" };
    documents = [{ name: start.brandDoc.name, path }];
  }
  const record: DesignSystem = {
    $schema: "https://schema.openspace.host/v1/design-system.json",
    version: 1,
    brief: start.brief,
    brand: {
      name: doc.site.title,
      ...(start.brandDoc?.text ? { guidelines: start.brandDoc.text.slice(0, 20_000) } : {}),
      ...(doc.site.logo ? { logo: doc.site.logo.src as never } : {}),
      ...(placed.length ? { photos: placed.map((p) => p.src as never) } : {}),
      ...(documents ? { documents } : {}),
    },
    tokens: brand ? { ...tokensFromStyles(doc.styles), ...brand } : tokensFromStyles(doc.styles),
    ...(rules.length ? { rules } : {}),
    mapping: {
      notes: [
        `Started from the ${input.templateName} template${input.why ? `, ${input.why}` : ""}; Claude makes it bespoke from here.`,
        ...notes,
      ].slice(0, 40),
      ...(contrast.length ? { contrast: contrast.slice(0, 80) } : {}),
    },
    sources: [
      { kind: "template", name: input.templateName },
      ...(start.tokens
        ? [
            {
              kind: "tokens" as const,
              name: (start.tokensName ?? "design tokens").slice(0, 200),
              ...(format ? { format } : {}),
            },
          ]
        : []),
      ...(start.colors?.length || start.fonts
        ? [{ kind: "manual" as const, name: "colours and fonts you chose" }]
        : []),
      ...(placed.length ? [{ kind: "photos" as const, name: `${placed.length} photo(s)` }] : []),
      ...(start.brandDoc
        ? [{ kind: "brand-doc" as const, name: start.brandDoc.name.slice(0, 200) }]
        : []),
    ],
    updatedAt: new Date(setup.createdAt).toISOString(),
  };
  doc = { ...doc, designSystem: record };
  return { doc, files };
}

/** The HTML route: the page they brought, made editable, with their brief in the record. */
export async function startHtmlFiles(
  services: Services,
  site: { id: string; name: string; repo?: string },
  setup: SiteSetup & { start: StartSetup },
): Promise<Record<string, string | FileContent>> {
  const start = setup.start;
  const html = start.html as NonNullable<StartSetup["html"]>;
  const bytes = await r2Bytes(services, html.key);
  const bundle = html.zip
    ? bundleFromZip(bytes, html.name)
    : bundleFromHtml(new TextDecoder().decode(bytes), html.name);
  const repoName = site.repo ? (site.repo.split("/")[1] ?? site.name) : site.name;
  const base = placeholderDocument({
    siteId: site.id,
    name: site.name,
    hubUrl: services.config.hubUrl,
    deployUrl: setup.deployUrl,
    sourceLabel: html.name,
  });
  const turnstileSiteKey = services.pub.config.turnstile.siteKey;
  const config = turnstileSiteKey
    ? { ...base.config, integrations: { ...base.config.integrations, turnstileSiteKey } }
    : base.config;
  let result: Awaited<ReturnType<typeof importHtmlBundle>>;
  try {
    result = await importHtmlBundle(bundle, {
      config,
      fetch: services.fetch as never,
      title: site.name,
      sourceLabel: html.name,
      now: new Date(setup.createdAt),
    });
  } catch (e) {
    throw new HttpError(
      422,
      "html_unreadable",
      `We couldn't read that page: ${(e as Error).message}`,
    );
  }
  let doc = result.doc;
  const { tokens: brand, notes } = brandTokens(start);
  if (brand) {
    // Their page's look stays; extra brand tokens they brought are recorded for Claude.
    notes.push(
      "Your page's own colours and fonts were kept; the brand files you added are in the design system for Claude.",
    );
  }
  doc = {
    ...doc,
    designSystem: {
      ...(doc.designSystem as DesignSystem),
      brief: start.brief,
      ...(start.brandDoc?.text
        ? {
            brand: {
              ...(doc.designSystem?.brand ?? {}),
              guidelines: start.brandDoc.text.slice(0, 20_000),
            },
          }
        : {}),
      ...(doc.designSystem?.mapping
        ? {
            mapping: {
              ...doc.designSystem.mapping,
              notes: [...doc.designSystem.mapping.notes, ...notes].slice(0, 40),
            },
          }
        : {}),
    },
  };
  const files: Record<string, string | FileContent> = {
    ...shellFiles(repoName),
    ...siteDocumentToFiles(doc),
    "IMPORT-REPORT.md": result.report,
    "content/setup-checklist.json": `${JSON.stringify(result.checklist, null, 2)}\n`,
  };
  for (const [path, b] of result.files)
    files[path] = { content: bytesToBase64(b), encoding: "base64" };
  return files;
}

// --- creating ----------------------------------------------------------------------------------------

function dataUrlBytes(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const m = /^data:([\w/+.-]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m)
    throw new HttpError(
      400,
      "invalid_upload",
      "That file couldn't be read. Try choosing it again.",
    );
  const bytes = m[2]
    ? base64ToBytes((m[3] as string).replace(/\s+/g, ""))
    : new TextEncoder().encode(decodeURIComponent(m[3] as string));
  return { mime: m[1] || "application/octet-stream", bytes };
}

export interface StartResult {
  site: SiteView;
  /** How the site was started, in plain words. */
  startedFrom: {
    kind: "template" | "html";
    template?: string;
    look?: string;
    why?: string;
    /** What's still the template's sample content, in plain words (template route). */
    note?: string;
  };
}

/** Plain words for what a template start still carries from the template's sample business. */
export function sampleNote(template: TemplateMeta): string {
  const shop = ((template as { tags?: string[] }).tags ?? []).some((t) =>
    /^(?:shop|store|products)$/i.test(t),
  );
  return [
    "Some words, pictures, contact details and events are still the template’s samples — “Finish setting up” shows what to swap for yours.",
    shop
      ? "The sample products are there to show the layout: your shop says “opening soon” to visitors until you add your own products and turn on payments."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Create a Start-with-Claude site: same install step, repository, draft branch and first publish
 * as any site; the first commit is the person's page made editable, or the closest template in
 * their brand. Uploads wait in R2 until the content is on `main` (so the install step can resume).
 */
export async function createStartSite(
  services: Services,
  user: User,
  input: StartInput,
  opts: { log?: Logger } = {},
): Promise<StartResult> {
  // Validate brand material up front (plain-language errors before anything is created).
  if (input.tokens) {
    try {
      readDesignTokens(input.tokens);
    } catch (e) {
      throw new HttpError(400, "invalid_tokens", (e as Error).message);
    }
  }
  let total = 0;
  const html = input.html ? dataUrlBytes(input.html.data) : undefined;
  if (html) {
    total += html.bytes.length;
    const zip = isZip(html.bytes);
    if (
      !zip &&
      !/<(?:html|body|section|div|main|h1)\b/i.test(
        new TextDecoder().decode(html.bytes.slice(0, 200_000)),
      )
    )
      throw new HttpError(400, "invalid_html", "That file isn't an HTML page or a zip of one.");
  }
  const photos = (input.photos ?? []).map((p) => {
    const d = dataUrlBytes(p.data);
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(d.mime))
      throw new HttpError(
        400,
        "invalid_photo",
        `${p.name} isn't a photo we can use (PNG, JPEG, WebP or GIF).`,
      );
    if (d.bytes.length > MAX_PHOTO_BYTES)
      throw new HttpError(400, "photo_too_large", `${p.name} is over 8 MB. Try a smaller version.`);
    total += d.bytes.length;
    return { name: p.name, ...d };
  });
  const brandFile = input.brandDoc?.data ? dataUrlBytes(input.brandDoc.data) : undefined;
  if (brandFile) total += brandFile.bytes.length;
  if (total > MAX_UPLOAD_BYTES)
    throw new HttpError(
      413,
      "uploads_too_large",
      "Those files add up to more than 40 MB. Leave out a few photos or videos.",
    );

  const now = services.now();
  const siteId = newId("st") as SiteId;
  const name = input.name.trim();
  const owner = input.owner ?? user.login;
  let installationId: number | null = null;
  let need: GitHubAccessNeed | null = null;
  const check = await checkInstallation(services, user, owner, opts.log);
  if (check.ok) installationId = check.installation.id;
  else need = check.need;
  const gh = services.github({ user, installationId });

  // Where to start from.
  const templates = await services.templates.list();
  const picked = html ? undefined : pickTemplate(templates, input);

  // Uploads to R2 (kept until the content is on main).
  const prefix = `site-setup/${siteId}`;
  const put = async (key: string, bytes: Uint8Array, mime: string) => {
    await services.uploads.put(key, bytes, { httpMetadata: { contentType: mime } });
    return key;
  };
  const start: StartSetup = {
    brief: {
      ...(input.about ? { about: input.about } : {}),
      ...(input.audience ? { audience: input.audience } : {}),
      ...(input.feeling?.length ? { feeling: input.feeling } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
    ...(input.tokens ? { tokens: input.tokens } : {}),
    ...(input.tokensName ? { tokensName: input.tokensName } : {}),
    ...(input.colors?.length ? { colors: input.colors } : {}),
    ...(input.fonts && (input.fonts.heading || input.fonts.body) ? { fonts: input.fonts } : {}),
    photos: [],
  };
  for (const [i, p] of photos.entries())
    start.photos.push({
      key: await put(`${prefix}/photo-${i + 1}`, p.bytes, p.mime),
      name: p.name,
      mime: p.mime,
    });
  if (html && input.html)
    start.html = {
      key: await put(`${prefix}/page`, html.bytes, html.mime),
      name: input.html.name,
      zip: isZip(html.bytes),
    };
  if (input.brandDoc)
    start.brandDoc = {
      name: input.brandDoc.name,
      ...(input.brandDoc.text ? { text: input.brandDoc.text } : {}),
      ...(brandFile
        ? {
            key: await put(`${prefix}/brand-doc`, brandFile.bytes, brandFile.mime),
            mime: brandFile.mime,
          }
        : {}),
    };

  // Logo (template route): the same handling as a template site.
  let logoMeta: SiteSetup["logo"] = null;
  if (input.logo && !html) {
    let logo: ReturnType<typeof decodeImageDataUrl>;
    try {
      logo = decodeImageDataUrl(input.logo, MAX_LOGO_BYTES);
    } catch (err) {
      throw new HttpError(400, "invalid_logo", (err as Error).message);
    }
    const mediaId = newId("med") as MediaId;
    logoMeta = {
      path: `media/${ymPath(now)}/logo-${mediaId.slice(4, 10)}.${logo.ext}`,
      mediaId,
      mime: logo.mime,
      bytes: logo.bytes,
      width: logo.width,
      height: logo.height,
      key: `${prefix}/logo`,
    };
    await put(logoMeta.key, base64ToBytes(logo.base64), logo.mime);
  }

  let row: SiteRow | null = null;
  let files: Record<string, string | FileContent> | undefined;
  for (let attempt = 0; attempt < 5 && !row; attempt++) {
    const repoName = await uniqueRepoName(services, gh, owner, slugifyRepoName(name));
    const setup: SiteSetup & { start: StartSetup } = {
      template: picked?.template.id ?? "html",
      look: picked?.look.id ?? "",
      ...heroCopy(input.about),
      brandColor: null,
      deployUrl:
        gh.kind === "dev"
          ? previewUrl(services.config.hubUrl, siteId)
          : githubPagesUrl(owner, repoName),
      createdAt: now,
      logo: logoMeta,
      start,
    };
    if (!need) {
      // Build now so problems surface before anything is stored.
      files = await buildStartFiles(
        services,
        { id: siteId, name, repo: `${owner}/${repoName}` },
        setup,
        user.id,
      );
    }
    try {
      await insertSite(services.db, {
        id: siteId,
        owner_id: user.id,
        name,
        tagline: setup.tagline,
        repo: `${owner}/${repoName}`,
        installation_id: installationId,
        deploy_target: "github-pages",
        domain: null,
        url: setup.deployUrl,
        template_id: picked?.template.id ?? "html",
        template_version: picked?.template.version ?? "1.0.0",
        look: picked?.look.id ?? null,
        status: need ? "failed" : "building",
        status_detail: need ? GITHUB_ACCESS_DETAIL[need] : null,
        github_access: need,
        setup_json: JSON.stringify(setup),
        created_at: now,
        updated_at: now,
      });
      row = await getSite(services.db, siteId);
    } catch (err) {
      if (!/UNIQUE constraint failed/i.test(String((err as Error).message))) throw err;
    }
  }
  if (!row)
    throw new HttpError(409, "name_taken", "That name was just taken. Try again or pick another.");
  const startedFrom: StartResult["startedFrom"] = picked
    ? {
        kind: "template",
        template: picked.template.name,
        look: picked.look.name,
        why: picked.why,
        note: sampleNote(picked.template),
      }
    : { kind: "html" };
  await audit(services.db, {
    siteId,
    actor: user.id,
    action: "site.create",
    meta: {
      start: startedFrom.kind,
      template: picked?.template.id ?? null,
      repo: row.repo,
      githubAccess: need,
    },
  });
  if (need) return { site: await getSiteView(services, siteId, user, opts.log), startedFrom };
  const result = await runSetup(services, row, user, {
    log: opts.log,
    ...(files ? { files } : {}),
  });
  await updateSite(
    services.db,
    siteId,
    { status: result.status, status_detail: result.detail, url: result.url },
    services.now(),
  );
  return { site: await getSiteView(services, siteId, user, opts.log), startedFrom };
}

// --- headline and intro from "What is it for?" ---------------------------------------------------

/** Hero headlines are designed for 3–9 words (the Design check's copy range); aim under that. */
export const HEADLINE_MAX_WORDS = 8;
/** The heading block's subheading holds up to 280 characters; hero intros read best ≤ 40 words. */
const INTRO_MAX_CHARS = 280;
const INTRO_MAX_WORDS = 40;

/** Words a headline shouldn't end on. */
const DANGLING =
  /^(?:a|an|the|and|or|but|of|in|on|at|to|for|with|from|by|our|my|your|their|its|that|which|who|where|selling|offering|running|making|plus|&)$/i;
/** Good places to end a headline early: before a clause or a list of extras. */
const BREAK_BEFORE =
  /^(?:selling|offering|running|making|teaching|providing|serving|that|which|who|where|while|with|and|plus|since|because|so)$/i;

const sentencesOf = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

/**
 * A short, punchy hero headline from what the person said the site is for: the first clause of
 * the first sentence, without a leading name ("Teal House Pottery: …", "We are …"), cut at a
 * natural break to at most {@link HEADLINE_MAX_WORDS} words — so the Design check never flags it.
 * "Teal House Pottery: a small ceramics studio in Portland selling handmade mugs…" →
 * "A small ceramics studio in Portland".
 */
export function headlineFrom(about: string): string | null {
  let t = (sentencesOf(about)[0] ?? "").replace(/[.!?…]+$/, "");
  if (!t) return null;
  // "Name: what it is" / "Name — what it is": keep what it is.
  const sep = /\s*(?::|\s[—–-]\s)\s*/.exec(t);
  if (sep && sep.index > 0) {
    const before = t.slice(0, sep.index).split(" ").length;
    const after = t.slice(sep.index + sep[0].length);
    if (before <= 5 && after.split(" ").length >= 2) t = after;
  }
  // "We are a …", "I'm a …", "Crumb is a …": keep "a …".
  t = t.replace(
    /^(?:we(?:'re| are)|i(?:'m| am)|(?:[\w&'’.-]+\s){0,4}?[\w&'’.-]+\s(?:is|are))\s+(?=(?:a|an|the)\s)/i,
    "",
  );
  // The first clause.
  t = t.split(/\s*(?:[,;(]|\s[—–-]\s)\s*/)[0] ?? t;
  let ws = t.split(" ").filter(Boolean);
  // A whole clause of nine words still fits the layout (3–9); longer ones are cut to eight.
  if (ws.length > HEADLINE_MAX_WORDS + 1) {
    let cut = -1;
    for (let i = Math.min(HEADLINE_MAX_WORDS, ws.length - 1); i >= 3; i--)
      if (BREAK_BEFORE.test(ws[i] as string)) {
        cut = i;
        break;
      }
    ws = ws.slice(0, cut > 0 ? cut : HEADLINE_MAX_WORDS);
  }
  while (ws.length > 1 && DANGLING.test(ws[ws.length - 1] as string)) ws.pop();
  const out = ws.join(" ").replace(/[,:;—–-]+$/, "");
  if (!out) return null;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * The hero's headline and supporting line from "What is it for?". The intro is dropped (the
 * template's sample line is removed) when it would only repeat the headline.
 */
export function heroCopy(about: string | undefined): { tagline: string | null; intro?: string } {
  const tagline = about ? headlineFrom(about) : null;
  if (!about || !tagline) return { tagline };
  const intro = introFrom(about);
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  return { tagline, intro: words(intro) <= words(tagline) + 2 ? "" : intro };
}

/** The hero's supporting line: what they said, whole sentences while they fit (≤ 280 chars). */
export function introFrom(about: string): string {
  const out: string[] = [];
  let words = 0;
  for (const s of sentencesOf(about)) {
    const n = s.split(" ").length;
    const next = [...out, s].join(" ");
    if (out.length && (words + n > INTRO_MAX_WORDS || next.length > INTRO_MAX_CHARS)) break;
    out.push(s);
    words += n;
  }
  let text = out.join(" ");
  if (text.length > INTRO_MAX_CHARS || words > INTRO_MAX_WORDS) {
    const ws = text.split(" ").slice(0, INTRO_MAX_WORDS);
    while (ws.join(" ").length > INTRO_MAX_CHARS - 1) ws.pop();
    while (ws.length > 1 && DANGLING.test(ws[ws.length - 1] as string)) ws.pop();
    text = `${ws.join(" ").replace(/[,:;—–-]+$/, "")}…`;
  }
  return text;
}

export type { StartSetup as StartSetupRecord };
