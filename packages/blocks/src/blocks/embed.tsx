import { cx, useRenderContext } from "@openspace/renderer";
import { defineBlock, type EmbedValue, f } from "@openspace/schema";

/**
 * Embed / code. URLs render as a lazy iframe. Code snippets always render inside a sandboxed
 * `srcdoc` iframe in the Studio canvas and previews — scripts run, but without
 * `allow-same-origin` they can't touch the page, cookies or storage (Global Constraint 12). On
 * the published site the owner may opt out of isolation (`isolate: false`) for snippets that
 * must run in the page itself.
 */

/** Sandbox for code snippets: scripts and popups, never same-origin. */
export const CODE_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";
/** Sandbox for third-party URLs (their own origin, so same-origin is safe and often required). */
export const URL_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";

const ASPECTS = [
  { value: "auto", label: "Fixed height" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "4:3", label: "Classic 4:3" },
  { value: "1:1", label: "Square 1:1" },
] as const;

/** A minimal document around a snippet: page fonts/colors inherited via a tiny reset. */
export function snippetDocument(code: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title.replace(/[<&]/g, "")}</title><style>html,body{margin:0;font-family:system-ui,sans-serif;line-height:1.5;color:#222;background:transparent}</style></head><body>${code}</body></html>`;
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
      default: {
        type: "code",
        code: '<div style="display:grid;place-items:center;min-height:180px;padding:24px;border:1px dashed #9a9a9a;border-radius:12px;text-align:center;font:15px/1.5 system-ui,sans-serif;color:#555">Paste an embed code from a booking, survey or ticketing service here.</div>',
      },
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
    isolate: f.boolean({
      default: true,
      label: "Run in an isolated frame",
      help: "Recommended. Turn off only for snippets that must run in the page itself.",
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
    const { mode } = useRenderContext();
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
      return (
        <div className={cls} style={sized}>
          <iframe
            src={embed.url}
            title={fields.title}
            loading="lazy"
            sandbox={URL_SANDBOX}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
          />
        </div>
      );
    }
    if (mode === "production" && !fields.isolate) {
      return (
        <div
          className={cx(cls, "is-inline")}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the owner's own snippet, opted out of isolation
          dangerouslySetInnerHTML={{ __html: embed.code }}
        />
      );
    }
    return (
      <div className={cls} style={sized}>
        <iframe
          srcDoc={snippetDocument(embed.code, fields.title)}
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
