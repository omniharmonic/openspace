import { compiledStylesFor, cx, SectionContext, useRenderContext } from "@openspace/renderer";
import {
  type ColorTheme,
  defineBlock,
  type EmbedValue,
  f,
  type SiteDocument,
} from "@openspace/schema";
import { useContext } from "react";

/**
 * Embed / code. Code snippets ALWAYS render inside a sandboxed `srcdoc` iframe without
 * `allow-same-origin`, in every mode (Global Constraint 12): scripts run, but can't touch the
 * page, cookies or storage. There is deliberately no way to inline a snippet into the page —
 * site-wide code belongs in Advanced head/footer injection, which is role-gated.
 * URL embeds are https-only lazy iframes; `allow-same-origin` is granted only to other origins.
 */

/** Sandbox for code snippets: scripts and popups, never same-origin. */
export const CODE_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";
/** Sandbox for third-party URLs (their own origin, so same-origin is safe and often required). */
export const URL_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";
/** Sandbox for URLs on the site's own origin: never same-origin (it would escape the sandbox). */
export const SAME_ORIGIN_URL_SANDBOX = URL_SANDBOX.replace("allow-same-origin ", "");

/** The instruction shown for an empty embed in Studio and previews (never published). */
export const EMBED_PLACEHOLDER =
  '<div style="display:grid;place-items:center;min-height:180px;padding:24px;border:1px dashed;border-radius:12px;text-align:center;font:15px/1.5 system-ui,sans-serif;opacity:.75">Paste an embed code from a booking, survey or ticketing service here.</div>';

const ASPECTS = [
  { value: "auto", label: "Fixed height" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "4:3", label: "Classic 4:3" },
  { value: "1:1", label: "Square 1:1" },
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Text/link colors of the section's theme, so snippets stay legible on dark sections. */
export interface SnippetColors {
  text: string;
  link: string;
  dark: boolean;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

/** Resolve snippet colors from the compiled site theme (undefined without a site). */
export function snippetColors(
  doc: SiteDocument | undefined,
  theme: ColorTheme,
): SnippetColors | undefined {
  if (!doc) return undefined;
  try {
    const roles = compiledStylesFor(doc.styles).tokens.themes[theme];
    const text = roles?.text;
    const link = roles?.link;
    const bg = roles?.background;
    if (!text || !link || !bg || !HEX.test(text) || !HEX.test(link) || !HEX.test(bg))
      return undefined;
    return { text, link, dark: luminance(bg) < 0.2 };
  } catch {
    return undefined;
  }
}

/**
 * A minimal document around a snippet. Colors come from the section theme when known;
 * otherwise the system colors (`CanvasText` with `color-scheme`) keep text readable.
 */
export function snippetDocument(code: string, title: string, colors?: SnippetColors): string {
  const color = colors
    ? `color-scheme:${colors.dark ? "dark" : "light"};color:${colors.text}`
    : "color-scheme:light dark;color:CanvasText";
  const link = colors ? `a{color:${colors.link}}` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replace(/[<&]/g, "")}</title><style>html,body{margin:0;font-family:system-ui,sans-serif;line-height:1.5;background:transparent;${color}}${link}</style></head><body>${code}</body></html>`;
}

/** Hosts the site is served from (deploy URL + custom domain). */
function siteHosts(doc: SiteDocument | undefined): string[] {
  if (!doc) return [];
  const hosts: string[] = [];
  try {
    hosts.push(new URL(doc.config.deploy.url).host);
  } catch {
    /* ignore */
  }
  if (doc.config.deploy.customDomain) hosts.push(doc.config.deploy.customDomain);
  return hosts;
}

export const embedBlock = defineBlock({
  type: "embed",
  version: 1,
  category: "embed",
  label: "Embed / Code",
  icon: "code-xml",
  description: "Embed a page from another service, or paste an HTML snippet.",
  fields: {
    embed: f.embed({
      default: { type: "code", code: EMBED_PLACEHOLDER },
      help: "An https link to embed, or an HTML snippet",
      ai: "Prefer dedicated blocks (video, map, form). Never paste snippets containing API keys or secrets.",
    }),
    title: f.text({
      maxLength: 120,
      default: "Embedded content",
      help: "Describes the embed for screen readers",
    }),
    aspect: f.select({ options: ASPECTS, default: "auto", label: "Shape" }),
    height: f.number({
      min: 60,
      max: 2000,
      integer: true,
      unit: "px",
      default: 240,
      help: "Used with fixed height",
    }),
  },
  variants: ["plain", "framed"],
  styleSlots: ["padding", "radius", "border", "shadow", "animation"],
  ai: {
    purpose:
      "Embeds third-party widgets (booking, surveys, tickets, playlists) by URL or HTML snippet.",
    whenToUse: "Only when no dedicated block exists for the service.",
    avoid:
      "Tracking scripts; snippets with secrets or API keys; embedding YouTube/Vimeo (use the video block) or maps (use the map block).",
  },
  render: ({ fields, variant }) => {
    const { mode, doc } = useRenderContext();
    const section = useContext(SectionContext);
    const embed = fields.embed as EmbedValue;
    const sized =
      fields.aspect === "auto"
        ? { "--embed-h": `${fields.height}px` }
        : { "--aspect": fields.aspect.replace(":", " / ") };
    const cls = cx(
      "os-embed",
      `os-embed--${variant}`,
      fields.aspect === "auto" ? "is-fixed" : "has-aspect",
    );
    if (embed.type === "url") {
      let url: URL;
      try {
        url = new URL(embed.url);
      } catch {
        return null;
      }
      if (url.protocol !== "https:") return null;
      const sameOrigin = siteHosts(doc).includes(url.host);
      return (
        <div className={cls} style={sized}>
          <iframe
            src={url.toString()}
            title={fields.title}
            loading="lazy"
            sandbox={sameOrigin ? SAME_ORIGIN_URL_SANDBOX : URL_SANDBOX}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
          />
        </div>
      );
    }
    if (mode === "production" && embed.code.trim() === EMBED_PLACEHOLDER) return null;
    const colors = snippetColors(doc, section?.style?.colorTheme ?? "light");
    return (
      <div className={cls} style={sized}>
        <iframe
          srcDoc={snippetDocument(embed.code, fields.title, colors)}
          title={fields.title}
          loading="lazy"
          sandbox={CODE_SANDBOX}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  },
});

export const embedCss = `
.os-embed{position:relative;width:100%}
.os-embed>iframe{display:block;width:100%;border:0;background:transparent}
.os-embed.is-fixed>iframe{height:var(--embed-h,240px)}
.os-embed.has-aspect{aspect-ratio:var(--aspect,16 / 9)}
.os-embed.has-aspect>iframe{position:absolute;inset:0;height:100%}
.os-embed--framed{padding:var(--os-space-xs);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-embed--framed.has-aspect>iframe{inset:var(--os-space-xs);width:calc(100% - 2 * var(--os-space-xs));height:calc(100% - 2 * var(--os-space-xs))}
.os-block.has-radius .os-embed{border-radius:var(--radius);overflow:hidden}
`;
