/**
 * Squarespace blocks (`.sqs-block`) → `SqBlock`. Works on both generations of markup: classic
 * `sqs-block-<type>` blocks with `data-block-json` (7.0 and early 7.1) and "website component"
 * blocks with `data-definition-name="website.components.<type>"` / `data-sqsp-block`.
 */
import {
  attr,
  byClass,
  byTag,
  classes,
  closest,
  type Element,
  find,
  findAll,
  hasClass,
  innerHtml,
  jsonAttr,
  scriptText,
  text,
} from "../dom";
import type { SqBlock, SqForm, SqFormField, SqFormFieldType, SqImage, SqImageCard } from "./types";

/** Strip Squarespace's `?format=…` resize suffix and protocol-relative prefixes. */
export function cleanImageUrl(raw: string): string {
  let url = raw.trim();
  if (url.startsWith("//")) url = `https:${url}`;
  if (url.startsWith("http://")) url = `https://${url.slice(7)}`;
  try {
    const u = new URL(url);
    u.searchParams.delete("format");
    u.searchParams.delete("content-type");
    return u.toString().replace(/\?$/, "");
  } catch {
    return url;
  }
}

const dims = (s: string | undefined): { width?: number; height?: number } => {
  const m = /^(\d+)x(\d+)$/.exec(s ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : {};
};

/** An `<img>` (with Squarespace's lazy-loading attributes) → `SqImage`. */
export function imageFrom(img: Element): SqImage | undefined {
  const src =
    attr(img, "data-src") ??
    attr(img, "data-image") ??
    attr(img, "src") ??
    attr(img, "data-image-src");
  if (!src || src.startsWith("data:")) return undefined;
  const size = dims(attr(img, "data-image-dimensions"));
  const w = Number(attr(img, "width"));
  const h = Number(attr(img, "height"));
  if (!size.width && w > 0 && h > 0) {
    size.width = w;
    size.height = h;
  }
  // Squarespace sometimes double-escapes alt text (`&amp;amp;`); parse5 undoes one level.
  const alt = (attr(img, "alt") ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  const out: SqImage = { url: cleanImageUrl(src), alt };
  if (size.width && size.height) {
    out.width = size.width;
    out.height = size.height;
  }
  const fp = /^([\d.]+),([\d.]+)$/.exec(attr(img, "data-image-focal-point") ?? "");
  if (fp) {
    const x = Number(fp[1]);
    const y = Number(fp[2]);
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && (x !== 0.5 || y !== 0.5)) out.focal = [x, y];
  }
  // Squarespace fills alt with the file name when the owner left it empty.
  if (/\.(?:jpe?g|png|gif|webp|avif|heic)$/i.test(out.alt) || /^image-asset/i.test(out.alt))
    out.alt = "";
  return out;
}

/** The block's kind tokens, most specific first. */
export function blockKind(el: Element): string {
  const tokens: string[] = [];
  const sqsp = attr(el, "data-sqsp-block");
  if (sqsp) tokens.push(sqsp);
  const def = attr(el, "data-definition-name");
  if (def?.startsWith("website.components.")) tokens.push(def.slice("website.components.".length));
  for (const c of classes(el))
    if (
      c.startsWith("sqs-block-") &&
      c !== "sqs-block-website-component" &&
      c !== "sqs-block-content"
    )
      tokens.push(c.slice("sqs-block-".length));
  for (const t of tokens) {
    const k = KIND_ALIASES[t.toLowerCase()];
    if (k) return k;
  }
  return tokens[0] ?? "unknown";
}

const KIND_ALIASES: Record<string, string> = {
  text: "text",
  html: "text",
  markdown: "text",
  image: "image",
  "image-classic": "image",
  imagelayout: "image",
  imagefluid: "image",
  gallery: "gallery",
  "gallery-block": "gallery",
  button: "button",
  form: "form",
  newsletter: "newsletter",
  video: "video",
  map: "map",
  code: "code",
  embed: "embed",
  quote: "quote",
  accordion: "accordion",
  summary: "summary",
  "summary-v2": "summary",
  spacer: "spacer",
  horizontalrule: "line",
  divider: "line",
  "social-links": "social",
  sociallinks: "social",
  socialaccountlinks: "social",
  "socialaccountlinks-v2": "social",
  audio: "audio",
  product: "product",
  shape: "shape",
};

/** Unescaped HTML of the block (for regex fallbacks over escaped JSON attributes). */
const flat = (el: Element) =>
  innerHtml(el)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

const VIDEO_URL_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)[\w-]+|youtu\.be\/[\w-]+|(?:player\.)?vimeo\.com\/(?:video\/)?\d+)[^\s"'<>\\]*/;

export function videoUrl(raw: string): string | undefined {
  const m = VIDEO_URL_RE.exec(raw);
  if (!m) return undefined;
  const u = m[0].replace(/&amp;/g, "&");
  const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/.exec(u);
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
  const vm = /vimeo\.com\/(?:video\/)?(\d+)/.exec(u);
  if (vm) return `https://vimeo.com/${vm[1]}`;
  return u;
}

const FIELD_TYPES: Record<string, SqFormFieldType> = {
  text: "text",
  textarea: "textarea",
  email: "email",
  phone: "phone",
  name: "name",
  address: "address",
  checkbox: "checkbox",
  radio: "radio",
  select: "select",
  date: "date",
  time: "time",
  website: "website",
  number: "number",
  file: "file",
  hidden: "hidden",
  likert: "likert",
  consent: "checkbox",
};

function optionList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((o) =>
      typeof o === "string"
        ? o
        : o && typeof o === "object"
          ? String(
              (o as { value?: unknown; title?: unknown }).value ??
                (o as { title?: unknown }).title ??
                "",
            )
          : "",
    )
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

/** Form definition from the form block's JSON context (7.1) or its rendered fields (7.0). */
export function formFrom(el: Element): SqForm | undefined {
  const ctxScript = find(
    el,
    (e) => e.tagName === "script" && (attr(e, "class") ?? "").includes("sqs-form-block-context"),
  );
  let ctx: Record<string, unknown> | undefined;
  if (ctxScript) {
    try {
      ctx = JSON.parse(scriptText(ctxScript)) as Record<string, unknown>;
    } catch {
      ctx = undefined;
    }
  }
  ctx ??= jsonAttr(el, "data-block-json");
  if (ctx && Array.isArray(ctx.formFields ?? (ctx as { fields?: unknown }).fields)) {
    const raw = (ctx.formFields ?? (ctx as { fields?: unknown }).fields) as Record<
      string,
      unknown
    >[];
    const fields: SqFormField[] = raw.map((f) => {
      const rawType = String(f.type ?? "text");
      return {
        type: FIELD_TYPES[rawType] ?? "other",
        label: String(f.title ?? f.label ?? rawType).trim() || rawType,
        required: f.required === true,
        ...(typeof f.description === "string" && f.description.trim()
          ? { description: stripTags(f.description) }
          : {}),
        ...(typeof f.placeholder === "string" && f.placeholder.trim()
          ? { placeholder: f.placeholder.trim() }
          : {}),
        ...(optionList(f.options) ? { options: optionList(f.options) } : {}),
        ...(FIELD_TYPES[rawType] ? {} : { rawType }),
      };
    });
    const msg = ctx.formSubmissionMessage as { html?: string } | string | undefined;
    return {
      name: String(ctx.formName ?? "Form").trim() || "Form",
      fields,
      ...(typeof ctx.formSubmitButtonText === "string" && ctx.formSubmitButtonText.trim()
        ? { submitLabel: ctx.formSubmitButtonText.trim() }
        : {}),
      ...(msg
        ? { successMessage: stripTags(typeof msg === "string" ? msg : (msg.html ?? "")) }
        : {}),
      ...(typeof ctx.successRedirect === "string" && ctx.successRedirect.trim()
        ? { successRedirect: ctx.successRedirect.trim() }
        : {}),
    };
  }
  // 7.0 markup: <div class="form-item field email required"><label class="title">…
  const items = findAll(el, (e) => classes(e).includes("form-item"));
  if (!items.length) return undefined;
  const fields: SqFormField[] = [];
  for (const item of items) {
    const cls = classes(item);
    const type =
      (Object.keys(FIELD_TYPES).find((t) => cls.includes(t)) as string | undefined) ??
      (find(item, byTag("textarea"))
        ? "textarea"
        : find(item, byTag("select"))
          ? "select"
          : "text");
    const label = text(find(item, (e) => classes(e).includes("title") || e.tagName === "legend"))
      .replace(/\*\s*$/, "")
      .replace(/\(required\)/i, "")
      .trim();
    const options = findAll(item, byTag("option"))
      .map((o) => text(o))
      .filter(Boolean);
    const choice = findAll(item, (e) => e.tagName === "label" && !classes(e).includes("title"))
      .map((l) => text(l))
      .filter(Boolean);
    fields.push({
      type: FIELD_TYPES[type] ?? "text",
      label: label || type,
      required: cls.includes("required"),
      ...(options.length
        ? { options }
        : choice.length && (type === "checkbox" || type === "radio")
          ? { options: choice }
          : {}),
    });
  }
  const button = find(el, (e) => e.tagName === "input" && attr(e, "type") === "submit");
  return {
    name: text(find(el, byClass("form-title"))) || "Form",
    fields,
    ...(button && attr(button, "value") ? { submitLabel: attr(button, "value") } : {}),
    successMessage: text(find(el, byClass("form-submission-text"))) || undefined,
  };
}

export const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function firstHref(el: Element): string | undefined {
  const a = find(el, (e) => e.tagName === "a" && !!attr(e, "href"));
  return a ? attr(a, "href") : undefined;
}

/**
 * Image blocks laid out with text (7.0/7.1 "card", "overlap", "collage", "stack", "poster"):
 * the title, subtitle and button, and where they sit.
 */
function imageCard(el: Element): SqImageCard | undefined {
  const wrapper = find(el, (e) => hasClass(e, "image-card-wrapper") || hasClass(e, "image-card"));
  if (!wrapper) return undefined;
  const title = text(find(wrapper, (e) => hasClass(e, "image-title")));
  const sub = find(wrapper, (e) => hasClass(e, "image-subtitle"));
  const a = find(
    wrapper,
    (e) =>
      e.tagName === "a" && !!attr(e, "href") && !!closest(e, (p) => hasClass(p, "image-button")),
  );
  const label = a ? text(a) : "";
  if (!title && !text(sub) && !label) return undefined;
  const fig = find(el, (e) => e.tagName === "figure") ?? el;
  const cls = classes(fig).join(" ");
  const layout = /design-layout-([a-z]+)/.exec(cls)?.[1] ?? "card";
  const position: SqImageCard["position"] =
    layout === "poster"
      ? "over"
      : layout === "stack"
        ? "below"
        : /image-position-right/.test(cls)
          ? "left"
          : "right";
  return {
    ...(title ? { title } : {}),
    ...(sub && text(sub) ? { html: innerHtml(sub) } : {}),
    ...(a && label ? { button: { label, href: attr(a, "href") as string } } : {}),
    position,
  };
}

/** Parse one `.sqs-block` element. Returns undefined for purely decorative blocks. */
export function parseBlock(el: Element): SqBlock | undefined {
  const kind = blockKind(el);
  const json = jsonAttr(el, "data-block-json") ?? {};
  switch (kind) {
    case "text": {
      const content =
        find(el, (e) => classes(e).includes("sqs-html-content")) ??
        find(el, byClass("sqs-block-content")) ??
        el;
      const html = innerHtml(content).replace(/<style[\s\S]*?<\/style>/gi, "");
      if (!text(content)) return undefined;
      return classes(el).includes("sqs-background-enabled")
        ? { kind: "text", html, panel: true }
        : { kind: "text", html };
    }
    case "image": {
      const img = find(el, byTag("img"));
      const image = img ? imageFrom(img) : undefined;
      if (!image) return undefined;
      const card = imageCard(el);
      if (card) return { kind: "image", image, card };
      const caption = text(
        find(
          el,
          (e) =>
            classes(e).some((c) => c === "image-caption" || c === "image-card") ||
            e.tagName === "figcaption",
        ),
      );
      const a = find(
        el,
        (e) =>
          e.tagName === "a" && !!attr(e, "href") && attr(e, "data-lightbox-theme") === undefined,
      );
      const href = a ? attr(a, "href") : undefined;
      return {
        kind: "image",
        image,
        ...(caption ? { caption } : {}),
        ...(href && !href.startsWith("#") ? { href } : {}),
      };
    }
    case "gallery": {
      const seen = new Set<string>();
      const images = findAll(el, byTag("img"))
        .map((img) => {
          const im = imageFrom(img);
          if (!im || seen.has(im.url)) return undefined;
          seen.add(im.url);
          return im;
        })
        .filter((x): x is SqImage => !!x);
      if (!images.length) return undefined;
      const cls = classes(el).join(" ") + flat(el).slice(0, 2000);
      const layout = /slideshow/.test(cls)
        ? "slideshow"
        : /carousel/.test(cls)
          ? "carousel"
          : /strip/.test(cls)
            ? "strips"
            : /masonry/.test(cls)
              ? "masonry"
              : "grid";
      return { kind: "gallery", images, layout };
    }
    case "button": {
      const a = find(el, (e) => e.tagName === "a");
      if (!a) return undefined;
      const label = text(a);
      if (!label) return undefined;
      const cls = classes(a).join(" ");
      const container = find(el, (e) =>
        classes(e).some((c) => c.startsWith("sqs-block-button-container--")),
      );
      const where = container
        ? classes(container)
            .find((c) => c.startsWith("sqs-block-button-container--"))
            ?.slice("sqs-block-button-container--".length)
        : (jsonAttr(el, "data-block-json") as { buttonAlignment?: string } | undefined)
            ?.buttonAlignment;
      return {
        kind: "button",
        label,
        href: attr(a, "href") ?? "/",
        ...(where === "center"
          ? { align: "center" as const }
          : where === "right"
            ? { align: "end" as const }
            : {}),
        style: /--secondary|secondary/.test(cls)
          ? "secondary"
          : /--tertiary|tertiary/.test(cls)
            ? "tertiary"
            : "primary",
      };
    }
    case "form": {
      const form = formFrom(el);
      return form?.fields.length ? { kind: "form", form } : undefined;
    }
    case "newsletter": {
      const heading = text(
        find(el, (e) => classes(e).some((c) => /newsletter-form-header-title/.test(c))),
      );
      const description = text(
        find(el, (e) => classes(e).some((c) => /newsletter-form-header-description/.test(c))),
      );
      const button = text(
        find(
          el,
          (e) =>
            (e.tagName === "button" || classes(e).some((c) => /newsletter-form-button/.test(c))) &&
            !!text(e),
        ),
      );
      const input = find(
        el,
        (e) =>
          e.tagName === "input" &&
          (attr(e, "type") === "email" || /email/i.test(attr(e, "name") ?? "")),
      );
      const success = text(find(el, (e) => classes(e).some((c) => /form-submission-text/.test(c))));
      return {
        kind: "newsletter",
        ...(heading ? { heading } : {}),
        ...(description ? { description } : {}),
        ...(button ? { buttonLabel: button } : {}),
        ...(input && attr(input, "placeholder") ? { placeholder: attr(input, "placeholder") } : {}),
        ...(success ? { success } : {}),
      };
    }
    case "video": {
      const src =
        (typeof json.url === "string" ? json.url : undefined) ??
        attr(el, "data-url") ??
        videoUrl(flat(el));
      const url = src ? (videoUrl(src) ?? src) : undefined;
      if (!url || !/^https?:\/\//.test(url)) return undefined;
      const title = typeof json.title === "string" ? json.title : undefined;
      const caption = text(find(el, byClass("video-caption"))) || undefined;
      return { kind: "video", url, ...(title ? { title } : {}), ...(caption ? { caption } : {}) };
    }
    case "map": {
      const loc = (json.location ?? {}) as Record<string, unknown>;
      let lat = Number(loc.markerLat ?? loc.mapLat);
      let lng = Number(loc.markerLng ?? loc.mapLng);
      const raw = flat(el);
      if (!Number.isFinite(lat) || !lat)
        lat = Number(/"(?:markerLat|mapLat)"\s*:\s*(-?[\d.]+)/.exec(raw)?.[1]);
      if (!Number.isFinite(lng) || !lng)
        lng = Number(/"(?:markerLng|mapLng)"\s*:\s*(-?[\d.]+)/.exec(raw)?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0))
        return undefined;
      const field = (k: string): string =>
        (typeof loc[k] === "string"
          ? (loc[k] as string)
          : (new RegExp(`"${k}"\\s*:\\s*"([^"]*)"`).exec(raw)?.[1] ?? "")
        ).trim();
      const name = field("addressTitle");
      const address = [field("addressLine1"), field("addressLine2"), field("addressCountry")]
        .filter(Boolean)
        .join(", ");
      const zoom = Number(loc.mapZoom ?? /"mapZoom"\s*:\s*([\d.]+)/.exec(raw)?.[1]);
      return {
        kind: "map",
        lat,
        lng,
        ...(Number.isFinite(zoom) && zoom > 0 ? { zoom: Math.round(zoom) } : {}),
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
      };
    }
    case "code": {
      const content = find(el, byClass("sqs-block-content")) ?? el;
      const html = innerHtml(content).trim();
      return html ? { kind: "code", html } : undefined;
    }
    case "embed": {
      const url = typeof json.url === "string" ? json.url : undefined;
      const html = typeof json.html === "string" ? json.html : undefined;
      const iframe = find(el, byTag("iframe"));
      const src = url ?? (iframe ? (attr(iframe, "src") ?? attr(iframe, "data-src")) : undefined);
      const content = find(el, byClass("sqs-block-content"));
      if (!src && !html && !(content && innerHtml(content).trim())) return undefined;
      return {
        kind: "embed",
        ...(src ? { url: src } : {}),
        ...(html ? { html } : !src && content ? { html: innerHtml(content).trim() } : {}),
      };
    }
    case "quote": {
      const bq = find(el, byTag("blockquote")) ?? el;
      const source = text(
        find(el, (e) => e.tagName === "figcaption" || classes(e).includes("source")),
      )
        .replace(/^[—–-]\s*/, "")
        .trim();
      const quote = text(bq)
        .replace(/^[“"]|[”"]$/g, "")
        .trim();
      return quote ? { kind: "quote", text: quote, ...(source ? { source } : {}) } : undefined;
    }
    case "accordion": {
      const items = findAll(el, (e) => classes(e).some((c) => c === "accordion-item"), {
        deep: false,
      })
        .map((item) => ({
          title: text(find(item, (e) => classes(e).some((c) => c === "accordion-item__title"))),
          html: innerHtml(
            find(item, (e) => classes(e).some((c) => c === "accordion-item__description")) ?? item,
          ),
        }))
        .filter((i) => i.title);
      return items.length ? { kind: "accordion", items } : undefined;
    }
    case "summary": {
      const links = findAll(el, (e) => e.tagName === "a" && !!attr(e, "href"))
        .map((a) => attr(a, "href") as string)
        .filter((h) => h.startsWith("/") && h.length > 1);
      const first = links.find((h) => h.split("/").filter(Boolean).length >= 2);
      const collectionPath = first ? `/${first.split("/").filter(Boolean)[0]}` : undefined;
      const heading = text(
        find(el, (e) => classes(e).some((c) => /summary-(?:heading|header-text)/.test(c))),
      );
      return {
        kind: "summary",
        ...(collectionPath ? { collectionPath } : {}),
        ...(heading ? { heading } : {}),
      };
    }
    case "spacer": {
      const ratio = Number(attr(el, "data-aspect-ratio"));
      return { kind: "spacer", ...(Number.isFinite(ratio) && ratio > 0 ? { ratio } : {}) };
    }
    case "line":
      return { kind: "line" };
    case "social":
      return { kind: "social" };
    case "audio": {
      const audioEl = find(
        el,
        (e) => !!attr(e, "data-url") || e.tagName === "audio" || e.tagName === "source",
      );
      const url =
        attr(el, "data-url") ??
        (audioEl ? (attr(audioEl, "data-url") ?? attr(audioEl, "src")) : undefined) ??
        (typeof json.audioAssetUrl === "string" ? json.audioAssetUrl : undefined);
      if (!url) return undefined;
      const title =
        (audioEl ? attr(audioEl, "data-title") : undefined) ??
        (typeof json.title === "string" ? json.title : undefined);
      return { kind: "audio", url, ...(title ? { title } : {}) };
    }
    case "product": {
      const href = findAll(el, (e) => e.tagName === "a")
        .map((a) => attr(a, "href") ?? "")
        .find((h) => /\/p\//.test(h) || h.split("/").filter(Boolean).length >= 2);
      // Product blocks set to show only the picture (title and price hidden) are a linked image.
      const styles = findAll(el, byTag("style")).map(scriptText).join(" ");
      if (
        /--product-block-display-title\s*:\s*none/.test(styles) &&
        /--product-block-display-price\s*:\s*none/.test(styles)
      ) {
        const img = find(el, byTag("img"));
        const image = img ? imageFrom(img) : undefined;
        if (image) return { kind: "image", image, ...(href ? { href } : {}) };
      }
      return { kind: "product", ...(href ? { path: href } : {}) };
    }
    case "shape":
      return undefined;
    default:
      return { kind: "unknown", type: kind, text: text(el).slice(0, 200) };
  }
}

export { firstHref };
