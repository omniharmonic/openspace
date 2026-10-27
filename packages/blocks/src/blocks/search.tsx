import { cx, siteUrlFor, useRenderContext } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";
import { EditorNotice } from "../shared";

const SearchIcon = ({ size = 20 }: { size?: number }) => (
  <svg
    className="os-icon"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </svg>
);

/**
 * No-JS fallback: a web search limited to the site (Pagefind needs JavaScript). With JS the
 * renderer's `search` behavior intercepts the click and opens the on-site search dialog.
 */
export function siteSearchFallback(siteUrl: string): string {
  const u = new URL(siteUrl);
  const scope = `${u.host}${u.pathname.replace(/\/+$/, "")}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(`site:${scope}`)}`;
}

export const searchBlock = defineBlock({
  type: "search",
  version: 1,
  category: "navigation",
  label: "Search",
  icon: "search",
  description: "A search box for the whole site; results appear instantly, with no server.",
  fields: {
    placeholder: f.text({ maxLength: 60, default: "Search classes, articles and events" }),
    shortcutHint: f.boolean({ default: true, help: "Show the '/' keyboard shortcut" }),
  },
  variants: ["field", "button", "icon"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "animation"],
  ai: {
    purpose: "Opens the site's built-in search (Pagefind), which indexes every published page.",
    whenToUse:
      "Sites with a blog, events or many pages — on a resources page, a 404 page or at the top of the journal. `icon` fits tight spaces.",
    avoid: "Small sites of a few pages, where navigation is enough.",
  },
  render: ({ fields, variant }) => {
    const { doc } = useRenderContext();
    const enabled = doc?.config.features.search ?? true;
    const href = doc ? siteSearchFallback(siteUrlFor(doc)) : "https://duckduckgo.com/";
    const label = variant === "button" ? "Search" : fields.placeholder;
    return (
      <div className={cx("os-searchblock", `os-searchblock--${variant}`)}>
        <a
          className="os-searchblock__trigger"
          href={href}
          rel="noopener"
          data-os-behavior={enabled ? "search" : undefined}
          aria-label={variant === "icon" ? "Search this site" : undefined}
        >
          <SearchIcon />
          {variant === "icon" ? null : <span className="os-searchblock__text">{label}</span>}
          {fields.shortcutHint && variant === "field" ? (
            <kbd className="os-searchblock__kbd" title="Press / to search">
              /
            </kbd>
          ) : null}
        </a>
        {enabled ? null : (
          <EditorNotice>
            Site search is off, so this opens a web search of your site instead. Turn on Search in
            Settings to search your pages directly.
          </EditorNotice>
        )}
      </div>
    );
  },
});

export const searchCss = `
.os-searchblock{display:grid;gap:var(--os-space-2xs)}
.os-searchblock__trigger{display:flex;align-items:center;gap:0.65em;color:var(--os-color-text);text-decoration:none;cursor:text}
.os-searchblock--field .os-searchblock__trigger{width:100%;max-inline-size:36rem;min-height:3rem;padding:0.7em 0.95em;border:1px solid var(--os-color-text-muted);border-radius:var(--os-radius-input);background:var(--os-color-background)}
.os-block.has-radius .os-searchblock--field .os-searchblock__trigger{border-radius:var(--radius)}
.os-searchblock--field .os-searchblock__trigger:hover{border-color:var(--os-color-text)}
.os-searchblock__trigger:focus-visible{outline:2px solid var(--os-color-focus);outline-offset:2px}
.os-searchblock__text{flex:1;color:var(--os-color-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.os-searchblock__kbd{flex:none;display:grid;place-items:center;min-width:1.6rem;height:1.6rem;padding-inline:0.4em;border:1px solid var(--os-color-border);border-radius:var(--os-radius-sm);font-family:inherit;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-searchblock--button .os-searchblock__trigger{justify-self:start;padding:0.6em 1.1em;border:1.5px solid var(--os-color-text-muted);border-radius:var(--os-radius-button);cursor:pointer;font-weight:var(--os-font-weight-strong)}
.os-searchblock--button .os-searchblock__text{color:inherit}
.os-searchblock--icon .os-searchblock__trigger{justify-self:start;display:grid;place-items:center;width:2.75rem;height:2.75rem;border-radius:var(--os-radius-full);cursor:pointer}
.os-searchblock--icon .os-searchblock__trigger:hover{background:var(--os-color-surface)}
.os-align-center .os-searchblock,.os-malign-center .os-searchblock{justify-items:center}
`;
