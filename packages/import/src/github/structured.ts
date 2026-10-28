/**
 * Sites whose content is structured data rendered by the site's own section components — a
 * headless-CMS setup such as Astro + Decap/Sveltia CMS, TinaCMS, CloudCannon, or Hugo/Eleventy
 * "page builder" front matter: every page is a YAML/JSON/Markdown file with a `sections` list of
 * typed objects (`type: hero_optin`, `kicker`, `headline`, `items`, `form`…), plus a settings file
 * for navigation, footer and SEO. Each section is read by what its fields mean (eyebrow, heading,
 * text, list, cards, FAQ, quote, image, buttons, sign-up or contact form, background), so any
 * component set maps onto OpenSpace's blocks and nearest section presets; the design tokens
 * (`design-tokens.json`, CSS custom properties) give the look. Anything the fields can't express
 * is taken from the published page instead.
 */
import type { SiteFetcher } from "../fetch";
import { applyLook } from "../fidelity/look";
import { lookFromTokens } from "../fidelity/tokens";
import { parseHtmlPage } from "../html/extract";
import { themeFromCss } from "../html/theme";
import { socialNetwork } from "../squarespace/crawl";
import type {
  SectionRole,
  SqBlock,
  SqCard,
  SqForm,
  SqFormField,
  SqImage,
  SqNavItem,
  SqNotice,
  SqPage,
  SqSection,
  SqSite,
} from "../types";
import { cleanPath, repoFetch } from "./jekyll";
import { markdownToHtml, parseFrontMatter, parseYamlSafe } from "./markdown";
import { decodeText, type RepoSource } from "./source";

type Obj = Record<string, unknown>;

const SECTION_KEYS = [
  "sections",
  "blocks",
  "components",
  "content_blocks",
  "modules",
  "page_sections",
  "body",
];
const TYPE_KEYS = [
  "type",
  "_type",
  "template",
  "_template",
  "component",
  "block",
  "_block",
  "layout",
];
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;
/** `[Amazon URL]`: a value the owner hasn't filled in yet. */
const isPlaceholder = (v: string) => /^\[[^\]]*\]$/.test(v.trim());
const filled = (v: unknown): string | undefined => {
  const s = str(v);
  return s && !isPlaceholder(s) ? s : undefined;
};
const typeOf = (o: Obj): string | undefined => {
  for (const k of TYPE_KEYS) if (typeof o[k] === "string") return o[k] as string;
  return undefined;
};

function sectionsOf(o: unknown): Obj[] | undefined {
  if (!isObj(o)) return undefined;
  for (const k of SECTION_KEYS) {
    const v = o[k];
    if (Array.isArray(v) && v.length && v.every((x) => isObj(x) && typeOf(x))) return v as Obj[];
  }
  return undefined;
}

export interface StructuredFile {
  path: string;
  data: Obj;
  body?: string;
}

/** Content files with typed section lists (the pages of a structured site). */
export async function findStructuredPages(
  source: RepoSource,
  files: readonly string[],
): Promise<StructuredFile[]> {
  const out: StructuredFile[] = [];
  const candidates = files.filter(
    (f) =>
      /\.(?:ya?ml|json|md|markdown|mdx)$/i.test(f) &&
      !/(?:^|\/)(?:node_modules|docs|\.github|public\/admin|static\/admin|admin)\//.test(f) &&
      !/(?:package(?:-lock)?|tsconfig|design-tokens|tokens)\.json$/i.test(f) &&
      /(?:^|\/)(?:content|data|_data|pages|src\/content|src\/data)\//.test(f),
  );
  for (const f of candidates.slice(0, 500)) {
    const bytes = await source.read(f);
    if (!bytes || bytes.length > 2_000_000) continue;
    const text = decodeText(bytes);
    let data: unknown;
    let body: string | undefined;
    if (/\.json$/i.test(f)) {
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }
    } else if (/\.ya?ml$/i.test(f)) data = parseYamlSafe(text);
    else {
      const p = parseFrontMatter(text);
      data = p.data;
      body = p.body;
    }
    if (sectionsOf(data)) out.push({ path: f, data: data as Obj, ...(body ? { body } : {}) });
  }
  return out;
}

// --- reading fields ---------------------------------------------------------------------------------

const inlineMd = (s: string) =>
  markdownToHtml(s)
    .replace(/^\s*<p>|<\/p>\s*$/g, "")
    .trim();
const plain = (s: string) =>
  s
    .replace(/\*\*|__|\*|_|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (s: string) => (/\n\s*\n/.test(s) ? markdownToHtml(s) : `<p>${inlineMd(s)}</p>`);

const EYEBROW = ["kicker", "eyebrow", "overline", "pretitle", "tagline_top", "label_top"];
const HEADING = ["title", "headline", "heading", "header", "name_heading"];
const SUBHEAD = ["subtitle", "subhead", "subheading", "tagline", "strapline"];
const TEXT = [
  "lead",
  "intro",
  "lede",
  "description",
  "body",
  "text",
  "content",
  "copy",
  "summary",
  "audience",
  "message",
];
const AFTER = ["closing", "outro", "footnote", "note", "helper", "line"];
const IMAGE = [
  "image",
  "portrait",
  "photo",
  "picture",
  "cover",
  "img",
  "media",
  "background_image",
  "hero_image",
];
const BUTTONS = ["buttons", "ctas", "actions", "links", "retailers"];
const BUTTON = ["button", "cta", "action", "link_button"];
const LISTS = ["list", "bullets", "points", "features_list", "names", "measures"];
const ITEMS = [
  "items",
  "columns",
  "cards",
  "features",
  "steps",
  "formats",
  "plans",
  "tiers",
  "faqs",
  "questions",
  "testimonials",
  "endorsements",
  "people",
  "team",
  "services",
];
const BG = ["ground", "background", "theme", "color_scheme", "scheme", "variant", "bg", "color"];

export interface StructuredContext {
  origin: string;
  /** Repo path of an icon by name (`circle` → `src/icons/circle.svg`). */
  icon: (name: string) => string | undefined;
  /** Section background name/color → Squarespace-style theme name the mapper knows. */
  theme: (v: string) => string;
  /** Section background name/color → its exact color (`#rrggbb`), when known. */
  groundColor?: (v: string) => string | undefined;
  notices: SqNotice[];
  where: string;
  placeholders: Set<string>;
  /** Text color on a section background (hex without #), for line icons. */
  fg?: (bg: string) => string | undefined;
  currentFg?: string;
}

function imageFrom(v: unknown, ctx: StructuredContext): SqImage | undefined {
  const src = isObj(v)
    ? (filled(v.src) ?? filled(v.url) ?? filled(v.path) ?? filled(v.image))
    : filled(v);
  if (!src) return undefined;
  const alt = isObj(v) ? (filled(v.alt) ?? filled(v.caption) ?? "") : "";
  try {
    return { url: new URL(src, `${ctx.origin}/`).toString(), alt };
  } catch {
    return undefined;
  }
}

function hrefOf(v: unknown, ctx: StructuredContext): string | undefined {
  const raw = str(v);
  if (!raw) return undefined;
  if (isPlaceholder(raw)) {
    ctx.placeholders.add(raw);
    return undefined;
  }
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(raw)) return `mailto:${raw}`;
  return raw;
}

function buttonFrom(v: unknown, ctx: StructuredContext): SqBlock | undefined {
  if (!isObj(v)) return undefined;
  const label = filled(v.label) ?? filled(v.text) ?? filled(v.title);
  const href = hrefOf(v.link ?? v.url ?? v.href ?? v.target, ctx);
  if (!label || !href) return undefined;
  const style = String(v.style ?? v.variant ?? "");
  return {
    kind: "button",
    label: plain(label),
    href,
    style: /outline|secondary|ghost/i.test(style)
      ? "secondary"
      : /link|text|tertiary/i.test(style)
        ? "tertiary"
        : "primary",
  };
}

/** `*_label` keys (with `*_options`) → form fields; email-only forms are newsletter sign-ups. */
function formFrom(v: unknown, ctx: StructuredContext): SqBlock | undefined {
  if (!isObj(v)) return undefined;
  const fields: SqFormField[] = [];
  let hasEmail = false;
  for (const [k, val] of Object.entries(v)) {
    const m = /^(.+?)_label$/.exec(k);
    if (!m || typeof val !== "string") continue;
    const name = m[1] as string;
    if (v[`show_${name}`] === false) continue;
    const options = Array.isArray(v[`${name}_options`])
      ? (v[`${name}_options`] as unknown[]).map(String)
      : undefined;
    const type: SqFormField["type"] = /email/.test(name)
      ? "email"
      : /phone|tel/.test(name)
        ? "phone"
        : options
          ? "select"
          : /message|comment|question/.test(name)
            ? "textarea"
            : /first_name|last_name|^name$|full_name/.test(name)
              ? "text"
              : "text";
    if (type === "email") hasEmail = true;
    fields.push({
      type,
      label: plain(val).replace(/^(\w)(.*)$/, (_x, a: string, b: string) => a + b.toLowerCase()),
      required: type === "email" || (v[`${name}_required`] as boolean | undefined) === true,
      ...(str(v[`${name}_placeholder`])
        ? { placeholder: str(v[`${name}_placeholder`]) as string }
        : {}),
      ...(options ? { options } : {}),
    });
  }
  const button = filled(v.button) ?? filled(v.submit) ?? filled(v.submit_label);
  if (!hasEmail && !fields.length) return undefined;
  const signupOnly = fields.every((f) => f.type === "email" || /first|name/i.test(f.label));
  if (signupOnly)
    return {
      kind: "newsletter",
      ...(fields.some((f) => f.type !== "email") ? { askName: true } : {}),
      ...(button ? { buttonLabel: plain(button) } : {}),
      ...(str(v.email_placeholder) ? { placeholder: str(v.email_placeholder) as string } : {}),
      ...(filled(v.success_message) ? { success: filled(v.success_message) as string } : {}),
    };
  const form: SqForm = {
    name:
      plain(filled(v.name) ?? filled(v.source) ?? ctx.where.replace(/^\//, "") ?? "Form") || "Form",
    fields,
    ...(button ? { submitLabel: plain(button) } : {}),
    ...(filled(v.success_message) ? { successMessage: filled(v.success_message) as string } : {}),
  };
  return { kind: "form", form };
}

function cardFrom(o: Obj, ctx: StructuredContext): SqCard | undefined {
  const num = filled(o.number) ?? filled(o.num) ?? filled(o.step);
  const title =
    filled(o.label) ??
    filled(o.name) ??
    filled(o.title) ??
    filled(o.headline) ??
    filled(o.heading) ??
    filled(o.term);
  const parts: string[] = [];
  const headline = filled(o.label) && filled(o.headline) ? filled(o.headline) : undefined;
  if (headline) parts.push(`<p><strong>${inlineMd(headline)}</strong></p>`);
  for (const k of [
    "price",
    "price_note",
    "definition",
    "line",
    "body",
    "text",
    "description",
    "summary",
    "note",
    "quote",
  ]) {
    const v = filled(o[k]);
    if (v && v !== title)
      parts.push(k === "definition" ? `<p><em>${inlineMd(v)}</em></p>` : para(v));
  }
  let href: string | undefined;
  let linkLabel: string | undefined;
  for (const k of BUTTONS) {
    const list = o[k];
    if (!Array.isArray(list)) continue;
    for (const b of list) {
      const btn = buttonFrom(b, ctx);
      if (btn && btn.kind === "button") {
        if (!href) {
          href = btn.href;
          linkLabel = btn.label;
        } else parts.push(`<p><a href="${esc(btn.href)}">${esc(btn.label)}</a></p>`);
      }
    }
  }
  const iconName = filled(o.icon);
  const iconPath = iconName ? ctx.icon(iconName) : undefined;
  const image =
    imageFrom(o.image ?? o.photo ?? o.picture, ctx) ??
    (iconPath
      ? {
          url: `${ctx.origin}/${iconPath}#${ctx.currentFg ? `color=${ctx.currentFg}&` : ""}icon`,
          alt: "",
        }
      : undefined);
  if (!title && !parts.length && !image) return undefined;
  return {
    title: plain(num && title ? `${num} ${title}` : (title ?? num ?? "")),
    ...(parts.length ? { html: parts.join("") } : {}),
    ...(image ? { image } : {}),
    ...(href ? { href, ...(linkLabel ? { linkLabel } : {}) } : {}),
  };
}

const ROLE_HINTS: [RegExp, SectionRole][] = [
  [/hero|banner|masthead|intro_?top|landing/i, "hero"],
  [/testimonial|endorse|praise|review|quote_?strip/i, "testimonials"],
  [/gallery|photos|portfolio/i, "gallery"],
  [/optin|cta|signup|subscribe|newsletter|offer|claim|confirm/i, "cta"],
  [/contact/i, "contact"],
  [/card|feature|benefit|grid|principle|service|step|term|measure/i, "features"],
];

/** One typed section → the source model (heading, text, list, cards, form, image, buttons). */
export function mapStructuredSection(
  o: Obj,
  index: number,
  ctx: StructuredContext,
): SqSection | undefined {
  if (o.visible === false || o.hidden === true || o.enabled === false || o.draft === true)
    return undefined;
  const type = typeOf(o) ?? "";
  const bgName = BG.map((k) => filled(o[k])).find(Boolean);
  if (bgName && ctx.fg) ctx.currentFg = ctx.fg(bgName);
  const main: SqBlock[] = [];
  const side: SqBlock[] = [];
  const used = new Set<string>([
    ...TYPE_KEYS,
    "id",
    "visible",
    "anchor",
    "headline_size",
    "align",
    "italic",
    "show_mark",
    ...BG,
  ]);
  const take = (keys: string[]) => {
    for (const k of keys) {
      const v = filled(o[k]);
      if (v) {
        used.add(k);
        return { k, v };
      }
    }
    return undefined;
  };
  // Heading.
  const eyebrow =
    take(EYEBROW) ??
    (Array.isArray(o.items) || Array.isArray(o.columns) ? undefined : take(["label"]));
  // No heading field: a person's name (author sections) or a one-line statement (CTA bands)
  // is the heading.
  const heading =
    take(HEADING) ??
    (Array.isArray(o.items) || Array.isArray(o.columns) ? undefined : take(["name", "line"]));
  const sub = take(SUBHEAD);
  const level = (index === 0 || /hero/i.test(type) ? 1 : 2) as 1 | 2;
  if (heading)
    main.push({
      kind: "heading",
      text: plain(heading.v),
      level,
      // A hero's title (a book or brand name) is set at the display size.
      ...(level === 1 && /hero/i.test(type) && plain(heading.v).length <= 40
        ? { display: true }
        : {}),
      ...(eyebrow ? { eyebrow: plain(eyebrow.v) } : {}),
      ...(sub ? { subheading: plain(sub.v) } : {}),
      ...(o.align === "center" ? { align: "center" as const } : {}),
    });
  else {
    if (eyebrow)
      main.push({ kind: "text", html: `<p><strong>${esc(plain(eyebrow.v))}</strong></p>` });
    if (sub) main.push({ kind: "text", html: `<h${level}>${esc(plain(sub.v))}</h${level}>` });
  }
  // Text.
  const texts: string[] = [];
  for (const k of TEXT) {
    const v = used.has(k) ? undefined : filled(o[k]);
    if (!v) continue;
    used.add(k);
    // A lead line reads larger than the running text (the lead preset), as it did.
    texts.push(
      (k === "lead" || k === "lede") && !/\n\s*\n/.test(v)
        ? `<p class="os-lead">${inlineMd(v)}</p>`
        : para(v),
    );
  }
  if (texts.length) main.push({ kind: "text", html: texts.join("") });
  if (Array.isArray(o.paragraphs)) {
    used.add("paragraphs");
    const ps = o.paragraphs.map(filled).filter((p): p is string => !!p);
    // Two to four short paragraphs sit side by side (a section's grid of columns).
    const columns = ps.length >= 2 && ps.length <= 4 && ps.every((p) => p.length <= 700);
    if (ps.length)
      main.push({ kind: "text", html: ps.map(para).join(""), ...(columns ? { columns } : {}) });
  }
  // Quote.
  const quote = filled(o.quote);
  if (quote) {
    used.add("quote");
    const by =
      filled(o.quote_attribution) ?? filled(o.attribution) ?? filled(o.author) ?? filled(o.cite);
    main.push({ kind: "quote", text: plain(quote), ...(by ? { source: plain(by) } : {}) });
  }
  // Lists of strings.
  for (const k of LISTS) {
    const v = o[k];
    if (!Array.isArray(v) || !v.length || !v.every((x) => typeof x === "string")) continue;
    used.add(k);
    const label = filled(o[`${k}_label`]) ?? filled(o[`${k.replace(/s$/, "")}_label`]);
    if (label) used.add(`${k}_label`);
    const ordered = /numbered|steps|measures/i.test(`${type} ${k}`);
    const items = (v as string[]).filter((x) => !isPlaceholder(x));
    const html =
      k === "names"
        ? `<p>${items.map((x) => esc(x)).join(" · ")}</p>`
        : `<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inlineMd(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`;
    main.push({
      kind: "text",
      html: `${label ? `<p><strong>${esc(plain(label))}</strong></p>` : ""}${html}`,
    });
  }
  // Items: FAQ, testimonials, strings, cards.
  for (const k of ITEMS) {
    const v = o[k];
    if (!Array.isArray(v) || !v.length) continue;
    used.add(k);
    if (v.every((x) => typeof x === "string")) {
      const ordered = /numbered|steps|measures/i.test(`${type} ${k}`);
      main.push({
        kind: "text",
        html: `<${ordered ? "ol" : "ul"}>${(v as string[]).map((x) => `<li>${inlineMd(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`,
      });
      continue;
    }
    const objs = v.filter(isObj);
    if (
      objs.length &&
      objs.every((x) => filled(x.question) && (filled(x.answer) ?? str(x.answer)))
    ) {
      main.push({
        kind: "accordion",
        items: objs.map((x) => ({
          title: plain(filled(x.question) as string),
          html: para(str(x.answer) as string),
        })),
      });
      continue;
    }
    if (objs.length && objs.every((x) => filled(x.quote))) {
      for (const x of objs)
        main.push({
          kind: "testimonial",
          html: `<p>${inlineMd(filled(x.quote) as string)}</p>`,
          ...(filled(x.name) ? { name: plain(filled(x.name) as string) } : {}),
          ...((filled(x.title) ?? filled(x.role))
            ? { role: plain((filled(x.title) ?? filled(x.role)) as string) }
            : {}),
        });
      continue;
    }
    const cards = objs.map((x) => cardFrom(x, ctx)).filter((c): c is SqCard => !!c);
    // Line icons sit small above the text, as they did: never crop them to a photo shape.
    const icons = cards.length > 0 && cards.every((c) => c.image?.url.endsWith("icon"));
    if (cards.length)
      main.push({ kind: "cards", items: cards, ...(icons ? { aspect: "original" as const } : {}) });
  }
  // Image (beside the text).
  for (const k of IMAGE) {
    if (!(k in o)) continue;
    used.add(k);
    const img = imageFrom(o[k], ctx);
    if (img) {
      side.push({ kind: "image", image: img });
      break;
    }
  }
  // Nested panels (`form_card: { heading, form }`) become the side column.
  for (const [k, v] of Object.entries(o)) {
    if (used.has(k) || !isObj(v) || /^(?:form|seo|button|cta|image)$/.test(k)) continue;
    if (!("form" in v) && !HEADING.some((h) => h in v)) continue;
    used.add(k);
    const inner = mapStructuredSection({ ...v, type: k }, 1, ctx);
    if (inner?.layout.mode === "classic")
      for (const row of inner.layout.rows) for (const col of row.columns) side.push(...col.blocks);
  }
  // Form.
  const form = formFrom(o.form, ctx);
  // A sign-up beside the pitch (as landing pages lay it out) unless the band is centered.
  const formAside = !!form && !side.length && !!heading && texts.length > 0 && o.align !== "center";
  const formIntro = isObj(o.form) ? filled(o.form.intro) : undefined;
  if (form) {
    used.add("form");
    const target = formAside ? side : main;
    if (formIntro) target.push({ kind: "text", html: para(formIntro) });
    target.push(form);
  }
  // Buttons.
  for (const k of BUTTONS) {
    const v = o[k];
    if (!Array.isArray(v) || ITEMS.includes(k)) continue;
    used.add(k);
    for (const b of v) {
      const btn = buttonFrom(b, ctx);
      if (btn) main.push(btn);
    }
  }
  for (const k of BUTTON) {
    if (!(k in o)) continue;
    used.add(k);
    const v = o[k];
    const btn = isObj(v)
      ? buttonFrom(v, ctx)
      : filled(v) && filled(o.target ?? o.link ?? o.url)
        ? buttonFrom({ label: v, link: o.target ?? o.link ?? o.url }, ctx)
        : undefined;
    if (btn) main.push(btn);
  }
  // Closing lines.
  const after: string[] = [];
  for (const k of AFTER) {
    const v = used.has(k) ? undefined : filled(o[k]);
    if (!v) continue;
    used.add(k);
    after.push(
      k === "helper" || k === "note" || k === "footnote"
        ? `<p><em>${inlineMd(v)}</em></p>`
        : // A closing line: the section's one italic pull line, at the lead size.
          (k === "closing" || k === "outro") && !/\n\s*\n/.test(v)
          ? `<p class="os-lead"><em>${inlineMd(v)}</em></p>`
          : para(v),
    );
  }
  // The helper line under a form stays with the form.
  const helper = filled(o.helper);
  if (formAside && helper && after.length) {
    const h = after.findIndex((x) => x.includes(inlineMd(helper)));
    if (h >= 0) side.push({ kind: "text", html: after.splice(h, 1)[0] as string });
  }
  if (after.length) main.push({ kind: "text", html: after.join("") });
  // Anything left that reads as text.
  const leftovers = Object.entries(o).filter(
    ([k, v]) =>
      !used.has(k) &&
      typeof v === "string" &&
      filled(v) &&
      !/(?:_label|_url|link|src|id|style|size|source|slug|class)$/i.test(k) &&
      (v as string).length > 25,
  );
  if (leftovers.length)
    main.push({ kind: "text", html: leftovers.map(([, v]) => para(v as string)).join("") });

  if (!main.length && !side.length) {
    ctx.notices.push({
      kind: "unsupported-block",
      where: ctx.where,
      message: `A "${type}" section had nothing the importer could read; check this part of the page.`,
    });
    return undefined;
  }
  let role: SectionRole | undefined;
  for (const [re, r] of ROLE_HINTS)
    if (re.test(type)) {
      role = r;
      break;
    }
  if (index === 0 && !role && (heading || side.length)) role = "hero";
  // A features preset suits card grids, not lists or prose.
  if (role === "features" && !main.some((b) => b.kind === "cards")) role = undefined;
  const bg = bgName;
  // A lone image beside the words (a book cover, a portrait) takes a narrower column.
  const imageOnly = side.length === 1 && side[0]?.kind === "image";
  const columns =
    side.length && main.length
      ? [
          { span: imageOnly ? 8 : 7, blocks: main },
          { span: imageOnly ? 4 : 5, blocks: side },
        ]
      : [{ span: 12, blocks: [...main, ...side] }];
  return {
    theme: bg ? ctx.theme(bg) : "",
    // The ground's exact color, so a section looks as it did (not just its nearest theme).
    ...(bg && ctx.groundColor?.(bg)
      ? { background: { color: ctx.groundColor(bg) as string } }
      : {}),
    layout: { mode: "classic", rows: [{ columns }] },
    ...((str(o.id) ?? str(o.anchor)) ? { id: (str(o.id) ?? str(o.anchor)) as string } : {}),
    ...(o.align === "center" ? { align: "center" as const } : {}),
    ...(role ? { role } : {}),
  };
}

// --- the site ------------------------------------------------------------------------------------------

/** Find a navigation list in a settings object: `[{ label, link }]` under nav/navigation/menu. */
function navItems(v: unknown): { label: string; href: string }[] {
  const lists: unknown[] = [];
  if (isObj(v))
    for (const k of ["items", "links", "main", "menu", "primary"])
      if (Array.isArray(v[k])) lists.push(v[k]);
  if (Array.isArray(v)) lists.push(v);
  for (const l of lists) {
    const out: { label: string; href: string }[] = [];
    for (const x of l as unknown[]) {
      if (!isObj(x)) continue;
      const label = filled(x.label) ?? filled(x.title) ?? filled(x.text) ?? filled(x.name);
      const href = filled(x.link) ?? filled(x.url) ?? filled(x.href) ?? filled(x.path);
      if (label && href) out.push({ label, href });
    }
    if (out.length) return out;
  }
  return [];
}

function lum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = Number.parseInt(m[1] as string, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}
function chroma(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = Number.parseInt(m[1] as string, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(...c) - Math.min(...c)) / 255;
}

export interface StructuredCrawlOptions {
  source: RepoSource;
  files: string[];
  pages: StructuredFile[];
  origin: string;
  baseurl: string;
  /** The published site, for pages the fields can't express (and the comparison). */
  live?: { fetcher: SiteFetcher; url: string };
  /** Network fetch for images hosted elsewhere. */
  next?: typeof fetch;
  onProgress?: (m: string) => void;
}

export async function crawlStructured(
  opts: StructuredCrawlOptions,
): Promise<{ site: SqSite; fetch: typeof fetch }> {
  const { source, files, origin } = opts;
  const progress = opts.onProgress ?? (() => undefined);
  const notices: SqNotice[] = [];
  const read = async (p: string) => {
    const b = await source.read(p);
    return b ? decodeText(b) : undefined;
  };

  // Settings: a non-page data file with navigation/footer/site keys.
  let settings: Obj = {};
  const settingsFile = files.find(
    (f) =>
      /(?:^|\/)(?:settings|site|global|config|general|site-settings)\.(?:ya?ml|json)$/i.test(f) &&
      /(?:^|\/)(?:content|data|_data|src\/content|src\/data)\//.test(f) &&
      !opts.pages.some((p) => p.path === f),
  );
  if (settingsFile) {
    const text = await read(settingsFile);
    const v = settingsFile.endsWith(".json")
      ? (() => {
          try {
            return JSON.parse(text ?? "");
          } catch {
            return undefined;
          }
        })()
      : parseYamlSafe(text ?? "");
    if (isObj(v)) settings = v;
  }

  // Design tokens: named colors and fonts.
  const colors = new Map<string, string>();
  let tokenCss = "";
  const tokenFile = files.find((f) => /(?:^|\/)(?:design-)?tokens\.json$/i.test(f));
  if (tokenFile) {
    try {
      const t = JSON.parse((await read(tokenFile)) ?? "{}") as Obj;
      const c = (t.color ?? t.colors ?? {}) as Obj;
      for (const [k, v] of Object.entries(c))
        if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) colors.set(k.toLowerCase(), v);
      const font = (t.font ?? t.fonts ?? {}) as Obj;
      const display = str(font.display) ?? str(font.heading) ?? str(font.headings);
      const body = str(font.body) ?? str(font.text) ?? str(font.base);
      if (body) tokenCss += `body{font-family:${body};}`;
      if (display) tokenCss += `h1,h2,h3{font-family:${display};}`;
      if (str(t.radius) === "0" || t.radius === 0) tokenCss += `.button,button{border-radius:0;}`;
    } catch {
      // not JSON
    }
  }
  let css = "";
  for (const f of files
    .filter((x) => /\.css$/i.test(x) && /(?:^|\/)(?:src\/styles|styles|css|assets)\//.test(x))
    .slice(0, 8))
    css += `\n${(await read(f)) ?? ""}`;
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-f]{6})\b/gi))
    if (!colors.has((m[1] as string).toLowerCase()))
      colors.set((m[1] as string).toLowerCase(), m[2] as string);
  // The brand: the most colorful named color that isn't very dark or very light.
  const ranked = [...colors.entries()]
    .filter(([, h]) => lum(h) > 0.03 && lum(h) < 0.6)
    .sort((a, b) => chroma(b[1]) - chroma(a[1]));
  const brand = ranked[0]?.[1];
  const bodyBg = /body\s*\{[^}]*background(?:-color)?\s*:\s*var\(--([\w-]+)\)/i.exec(css)?.[1];
  const siteBg =
    (bodyBg && colors.get(bodyBg.toLowerCase())) ??
    /body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  const theme = themeFromCss(
    `${css}\n${tokenCss}\n${brand ? `a.button,.button,button{background-color:${brand};}` : ""}\n${siteBg ? `body{background-color:${siteBg};}` : ""}`,
  );
  if (brand) theme.colors.accent = brand;
  if (siteBg) theme.siteBackground = siteBg;
  // The design tokens' typography and rhythm (fonts per role, type scale, widths, padding).
  if (tokenFile)
    try {
      const look = lookFromTokens(JSON.parse((await read(tokenFile)) ?? "{}") as Obj);
      if (look) applyLook(theme, look, `the design tokens (${tokenFile})`);
    } catch {
      // not JSON
    }
  const sectionTheme = (v: string): string => {
    const hex = /^#[0-9a-f]{6}$/i.test(v) ? v : colors.get(v.toLowerCase());
    if (!hex)
      return /dark|black|night/i.test(v)
        ? "black"
        : /light|white|paper|bone|cream/i.test(v)
          ? "white"
          : /brand|accent|primary/i.test(v)
            ? "bright"
            : "";
    if (brand && hex.toLowerCase() === brand.toLowerCase()) return "bright";
    const l = lum(hex);
    return l < 0.015 ? "black" : l < 0.2 ? "dark" : l > 0.9 ? "white" : "light";
  };
  // Text color per background: the tokens' grounds, the CSS ground classes, else light-on-dark.
  const groundText = new Map<string, string>();
  if (tokenFile)
    try {
      const t = JSON.parse((await read(tokenFile)) ?? "{}") as Obj;
      for (const [k, v] of Object.entries((t.grounds ?? {}) as Obj))
        if (isObj(v) && typeof v.text === "string")
          groundText.set(k.toLowerCase(), v.text.toLowerCase());
    } catch {
      // ignore
    }
  for (const m of css.matchAll(/\.g-([\w-]+)\s*\{[^}]*--fg\s*:\s*var\(--([\w-]+)\)/gi))
    if (!groundText.has((m[1] as string).toLowerCase()))
      groundText.set((m[1] as string).toLowerCase(), (m[2] as string).toLowerCase());
  const byLum = [...colors.values()].sort((a, b) => lum(a) - lum(b));
  const fgFor = (v: string): string | undefined => {
    const named = groundText.get(v.toLowerCase());
    const hex = named ? (colors.get(named) ?? (/^#/.test(named) ? named : undefined)) : undefined;
    if (hex) return hex.replace("#", "");
    const bgHex = /^#[0-9a-f]{6}$/i.test(v) ? v : colors.get(v.toLowerCase());
    if (!bgHex || !byLum.length) return undefined;
    return (lum(bgHex) < 0.2 ? (byLum[byLum.length - 1] as string) : (byLum[0] as string)).replace(
      "#",
      "",
    );
  };
  const iconByName = new Map<string, string>();
  for (const f of files) {
    const m = /(?:^|\/)(?:icons?|svg|svgs)\/([^/]+)\.svg$/i.exec(f);
    if (m) iconByName.set((m[1] as string).toLowerCase(), f);
  }

  // Pages.
  const placeholders = new Set<string>();
  const pages: SqPage[] = [];
  const typesSeen = new Map<string, number>();
  for (const file of opts.pages) {
    const base = (file.path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
    const rel = file.path
      .replace(/^.*?(?:content|data|pages)\/(?:pages\/)?/, "")
      .replace(/\.[^.]+$/, "");
    const explicit =
      filled(file.data.permalink) ??
      filled(file.data.slug) ??
      filled(file.data.path) ??
      filled(file.data.url);
    if (/^(?:404|not-?found|error)$/i.test(base)) continue;
    const path = explicit
      ? cleanPath(explicit.startsWith("/") ? explicit : `/${explicit}`)
      : /^(?:home|index|_index|homepage|front)$/i.test(base)
        ? "/"
        : cleanPath(`/${rel.replace(/(?:^|\/)(?:index|_index)$/, "")}`);
    progress(path);
    const ctx: StructuredContext = {
      origin,
      icon: (n) => iconByName.get(n.toLowerCase()),
      theme: sectionTheme,
      groundColor: (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : colors.get(v.toLowerCase())),
      notices,
      where: path,
      placeholders,
      fg: fgFor,
    };
    const raw = sectionsOf(file.data) ?? [];
    const sections: SqSection[] = [];
    for (const s of raw) {
      typesSeen.set(typeOf(s) ?? "?", (typesSeen.get(typeOf(s) ?? "?") ?? 0) + 1);
      const mapped = mapStructuredSection(s, sections.length, ctx);
      if (mapped) sections.push(mapped);
    }
    if (file.body?.trim())
      sections.push({
        theme: "",
        layout: {
          mode: "classic",
          rows: [
            {
              columns: [{ span: 12, blocks: [{ kind: "text", html: markdownToHtml(file.body) }] }],
            },
          ],
        },
      });
    const seo = isObj(file.data.seo) ? file.data.seo : file.data;
    const firstHeading = sections
      .flatMap((s) =>
        s.layout.mode === "classic"
          ? s.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
          : [],
      )
      .find((b): b is Extract<SqBlock, { kind: "heading" }> => b.kind === "heading");
    const seoTitle = filled(seo.title) ?? filled(file.data.title);
    const title =
      path === "/"
        ? "Home"
        : (filled(file.data.title) ??
          filled(file.data.nav_title) ??
          base.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()) ??
          firstHeading?.text);
    const image = imageFrom(seo.social_image ?? seo.image ?? seo.og_image, ctx);
    pages.push({
      path,
      title: plain(title),
      seo: {
        ...(seoTitle ? { title: seoTitle } : {}),
        ...(filled(seo.description) ? { description: filled(seo.description) as string } : {}),
        ...(image ? { image } : {}),
        ...(seo.noindex === true ? { noindex: true } : {}),
      },
      sections,
      // Pages that aren't in the navigation (thank-you pages) stay hidden from it.
      hidden: true,
    });
  }

  // Compare with the published pages: where the fields lost most of the text, use the page.
  if (opts.live) {
    for (const p of pages) {
      const url = new URL(`.${p.path === "/" ? "/" : `${p.path}/`}`, opts.live.url).toString();
      const r = await opts.live.fetcher.text(url).catch(() => undefined);
      if (!r || r.status >= 400) continue;
      const livePage = parseHtmlPage(r.text, r.url || url);
      const ours = JSON.stringify(p.sections).replace(/<[^>]+>|"[a-z]+":/g, "").length;
      if (livePage.textLength > 200 && ours < livePage.textLength * 0.35) {
        p.sections = livePage.sections;
        notices.push({
          kind: "other",
          where: p.path,
          message:
            "This page's content files didn't describe everything on it, so it was read from the published page.",
        });
      }
    }
  }

  // Navigation and header button.
  const navSrc = settings.navigation ?? settings.nav ?? settings.menu ?? settings.header;
  const toAbs = (h: string) =>
    /^(?:https?:|mailto:|tel:)/.test(h) ? h : `${origin}${h.startsWith("/") ? h : `/${h}`}`;
  const nav: SqNavItem[] = navItems(navSrc).map((n) => ({
    type: "link",
    label: n.label,
    href: toAbs(n.href),
  }));
  if (isObj(navSrc)) {
    for (const [k, v] of Object.entries(navSrc)) {
      if (!isObj(v) || k === "button" || v.visible === false) continue;
      const label = filled(v.label);
      const link = filled(v.link) ?? filled(v.url);
      if (label && link && !nav.some((n) => n.type === "link" && n.label === label))
        nav.push({ type: "link", label, href: toAbs(link) });
    }
  }
  for (const n of nav) {
    if (n.type !== "link") continue;
    const path = (() => {
      try {
        return cleanPath(new URL(n.href).pathname);
      } catch {
        return undefined;
      }
    })();
    const page = pages.find((p) => p.path === path && !new URL(n.href).hash);
    if (page) {
      page.hidden = false;
      page.navTitle = n.label;
    }
  }
  const navButton = isObj(navSrc) && isObj(navSrc.button) ? navSrc.button : undefined;
  const headerAction =
    navButton && filled(navButton.label) && filled(navButton.link)
      ? { label: filled(navButton.label) as string, href: toAbs(filled(navButton.link) as string) }
      : undefined;

  // Footer: links, social, copyright.
  const footerSrc = (settings.footer ?? {}) as Obj;
  const social: SqSite["social"] = [];
  const footerLinks: string[] = [];
  for (const l of navItems(footerSrc)) {
    if (isPlaceholder(l.href)) {
      placeholders.add(l.href);
      continue;
    }
    const net = /^https?:/.test(l.href) ? socialNetwork(l.href) : undefined;
    if (net && !social.some((s) => s.network === net)) social.push({ network: net, url: l.href });
    footerLinks.push(
      `<a href="${esc(/^(?:https?:|mailto:)/.test(l.href) ? l.href : toAbs(l.href))}">${esc(l.label)}</a>`,
    );
  }
  const site0 = (settings.site ?? {}) as Obj;
  const siteTitle =
    filled(site0.name) ??
    filled(site0.title) ??
    filled(settings.title) ??
    filled(settings.name) ??
    filled((settings.navigation as Obj | undefined)?.wordmark) ??
    new URL(origin).host;
  const footerLines = [
    filled(footerSrc.wordmark_line) ?? filled(footerSrc.tagline),
    footerLinks.length ? footerLinks.join(" · ") : undefined,
    filled(footerSrc.copyright),
  ].filter(Boolean) as string[];
  const footer: SqSection[] = footerLines.length
    ? [
        {
          theme: "",
          layout: {
            mode: "classic",
            rows: [
              {
                columns: [
                  {
                    span: 12,
                    blocks: [
                      { kind: "text", html: footerLines.map((l) => `<p>${l}</p>`).join("") },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ]
    : [];

  // Forms that posted to a server function.
  const forms = (settings.forms ?? {}) as Obj;
  const destination =
    filled(forms.optin_destination) ?? filled(forms.action) ?? filled(forms.endpoint);
  if (destination || files.some((f) => /^api\/.+\.(?:js|ts)$/.test(f)))
    notices.push({
      kind: "form",
      where: "site",
      message: `Sign-up forms sent their emails to ${destination ?? "a server function in api/"}, which doesn't run on the new hosting. They now use OpenSpace's own sign-up and form handling — connect your email list in "Finish setting up".`,
    });
  if (files.some((f) => /(?:^|\/)admin\/config\.ya?ml$/.test(f)))
    notices.push({
      kind: "other",
      where: "site",
      message:
        "The site had its own content editor (Decap/Sveltia CMS at /admin). OpenSpace Studio replaces it: edit every page visually there.",
    });
  if (placeholders.size)
    notices.push({
      kind: "link",
      where: "site",
      message: `${placeholders.size} link(s) were still placeholders (${[...placeholders].slice(0, 4).join(", ")}${placeholders.size > 4 ? "…" : ""}); their buttons were left out until you add the real addresses.`,
    });
  const unknownTypes = [...typesSeen.keys()];
  const favicon = [
    "public/favicon.svg",
    "public/favicon.ico",
    "static/favicon.ico",
    "favicon.ico",
  ].find((f) => files.includes(f));
  const site: SqSite = {
    baseUrl: origin,
    title: siteTitle,
    ...((filled((settings.book as Obj | undefined)?.description) ?? filled(settings.description))
      ? {
          description: (filled((settings.book as Obj | undefined)?.description) ??
            filled(settings.description)) as string,
        }
      : {}),
    ...(favicon ? { favicon: `${origin}/${favicon.replace(/^(?:public|static)\//, "")}` } : {}),
    social,
    nav,
    ...(headerAction ? { headerAction } : {}),
    footer,
    theme,
    pages,
    collections: [],
    aliases: [],
    customCode: [],
    notices,
    platform: "github",
    generator: "structured content",
    sources: [
      `${opts.pages.length} content file(s) with ${unknownTypes.length} section type(s) in ${source.label}`,
      ...(tokenFile ? [`design tokens (${tokenFile})`] : []),
      ...(opts.live ? ["the published pages (comparison)"] : []),
    ],
  };
  // Static files: `/uploads/x.jpg` lives in `public/uploads/x.jpg` (Astro, Vite) or `static/`.
  const serve = repoFetch(source, origin, {
    baseurl: opts.baseurl,
    ...(opts.next ? { next: opts.next } : {}),
    resolvePage: (p) => {
      const rel = p.replace(/^\/+/, "");
      return [`public/${rel}`, `static/${rel}`, `src/${rel}`];
    },
  });
  return { site, fetch: serve };
}
