import { cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { colorVar } from "@openspace/theme";
import { typo } from "../shared";

/** Heading (a convenience over rich text) and the ornamental divider. */

const LEVELS = [
  { value: "h1", label: "Heading 1 (page title)" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
] as const;

const SIZES = [
  { value: "auto", label: "Match level" },
  { value: "display", label: "Display" },
  { value: "h1", label: "Extra large" },
  { value: "h2", label: "Large" },
  { value: "h3", label: "Medium" },
  { value: "h4", label: "Small" },
] as const;

export const headingBlock = defineBlock({
  type: "heading",
  version: 1,
  category: "text",
  label: "Heading",
  icon: "heading",
  description: "A heading with an optional eyebrow and subheading, sized by your type scale.",
  fields: {
    eyebrow: f.text({ optional: true, maxLength: 60, help: "Small label above the heading" }),
    text: f.text({
      maxLength: 160,
      default: "Find the practice that fits your week",
      ai: "Plain, specific and short (3–9 words). Sentence case.",
    }),
    level: f.select({
      options: LEVELS,
      default: "h2",
      help: "Use one Heading 1 per page; it tells search engines what the page is about",
    }),
    size: f.select({ options: SIZES, default: "auto", label: "Visual size" }),
    subheading: f.text({ optional: true, multiline: true, maxLength: 280 }),
  },
  variants: ["plain", "rule", "underline", "split"],
  styleSlots: ["colorTheme", "padding", "align", "animation", "typography.heading"],
  defaults: {
    fields: {
      eyebrow: "Classes & workshops",
      subheading:
        "From slow Saturday foundations to evening yin, every class is capped at fourteen people so your teacher knows your name.",
    },
  },
  ai: {
    purpose: "A section heading with optional eyebrow and supporting line.",
    whenToUse:
      "To open a section or introduce a group of blocks. `rule` adds a short accent line above, `underline` a line below, `split` puts the subheading beside the heading on wide screens.",
    avoid:
      "Using headings for emphasis inside body copy (use text); skipping levels (h2 → h4); more than one Heading 1 per page.",
  },
  render: ({ fields, variant, style }) => {
    const Tag = fields.level;
    const size = fields.size === "auto" ? fields.level : fields.size;
    return (
      <div className={cx("os-heading", `os-heading--${variant}`)}>
        <div className="os-heading__main">
          {fields.eyebrow ? (
            <p className="os-heading__eyebrow os-type-eyebrow">{fields.eyebrow}</p>
          ) : null}
          <Tag className={cx("os-heading__text", typo(style, "heading", size))}>{fields.text}</Tag>
        </div>
        {fields.subheading ? (
          <p className="os-heading__sub os-type-lead">{fields.subheading}</p>
        ) : null}
      </div>
    );
  },
});

// --- divider with ornament ----------------------------------------------------------------------

/** Ornaments drawn on a 48×24 grid, stroked or filled in currentColor. */
const ORNAMENTS = {
  flourish: (
    <path
      d="M4 12c6 0 8-6 13-6 3 0 4 2 4 3.5S19.8 12 18.5 12 17 11 17 10M44 12c-6 0-8 6-13 6-3 0-4-2-4-3.5s1.2-2.5 2.5-2.5 1.5 1 1.5 2M21 12h6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  ),
  star: <path d="M24 3l2.6 6.4L33 12l-6.4 2.6L24 21l-2.6-6.4L15 12l6.4-2.6z" fill="currentColor" />,
  diamond: (
    <>
      <path d="M24 5l7 7-7 7-7-7z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11" cy="12" r="1.6" fill="currentColor" />
      <circle cx="37" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  dots: (
    <>
      <circle cx="14" cy="12" r="2" fill="currentColor" />
      <circle cx="24" cy="12" r="2.6" fill="currentColor" />
      <circle cx="34" cy="12" r="2" fill="currentColor" />
    </>
  ),
  leaf: (
    <path
      d="M24 20c0-7 4-12 11-14-1 7-5 12-11 14zm0 0c0-7-4-12-11-14 1 7 5 12 11 14zm0 0V8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  ),
  wave: (
    <path
      d="M4 12c4-5 6-5 10 0s6 5 10 0 6-5 10 0 6 5 10 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
  asterism: (
    <path
      d="M24 4v7m-3-5 6 3m0-3-6 3M14 13v7m-3-5 6 3m0-3-6 3M34 13v7m-3-5 6 3m0-3-6 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  ),
} as const;
type Ornament = keyof typeof ORNAMENTS;

export const dividerBlock = defineBlock({
  type: "divider",
  version: 1,
  category: "layout",
  label: "Divider with ornament",
  icon: "separator-horizontal",
  description: "A decorative break between passages: lines around an ornament or a short label.",
  fields: {
    ornament: f.select({
      options: (Object.keys(ORNAMENTS) as Ornament[]).map((value) => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      })),
      default: "leaf",
    }),
    label: f.text({
      optional: true,
      maxLength: 40,
      help: "Short text in place of the ornament (label variant), e.g. 'Est. 2019'",
    }),
    length: f.select({
      options: [
        { value: "short", label: "Short" },
        { value: "half", label: "Half" },
        { value: "full", label: "Full width" },
      ],
      default: "half",
      display: "segmented",
    }),
    color: f.color({ default: "accent", help: "Ornament color (lines use the border color)" }),
  },
  variants: ["lines", "ornament", "label"],
  styleSlots: ["padding", "animation"],
  defaults: { fields: { label: "Est. 2019" } },
  ai: {
    purpose: "A decorative separator: a small ornament or label between thin lines.",
    whenToUse:
      "Between passages of long-form text, menus or story pages where a plain line feels too stark. One or two per page.",
    avoid: "Separating every block; ornaments that clash with a minimal site style.",
  },
  render: ({ fields, variant }) => {
    const label = variant === "label" && fields.label;
    return (
      <div
        className={cx("os-divider", `os-divider--${variant}`, `os-divider--${fields.length}`)}
        style={{ "--div-c": `var(${colorVar(fields.color)})` }}
        role={label ? undefined : "separator"}
      >
        {label ? (
          <p className="os-divider__label">{label}</p>
        ) : (
          <svg
            className="os-divider__ornament"
            viewBox="0 0 48 24"
            width="48"
            height="24"
            aria-hidden="true"
            focusable="false"
          >
            {ORNAMENTS[fields.ornament]}
          </svg>
        )}
      </div>
    );
  },
});

export const headingCss = `
.os-heading{display:grid;gap:var(--os-space-xs)}
.os-heading__main{display:grid;gap:var(--os-space-2xs)}
.os-heading__eyebrow{color:var(--os-color-link);margin:0}
.os-heading__text{margin:0;text-wrap:balance;color:var(--os-color-heading)}
.os-heading__sub{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure);text-wrap:pretty}
.os-heading--rule .os-heading__main::before{content:"";width:2.5rem;height:3px;border-radius:var(--os-radius-full);background:var(--os-color-accent);margin-bottom:var(--os-space-2xs)}
.os-heading--underline .os-heading__main{padding-bottom:var(--os-space-xs);border-bottom:1px solid var(--os-color-border)}
@container block (min-width:52rem){.os-heading--split{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:end;gap:var(--os-space-lg)}}
.os-align-center .os-heading,.os-malign-center .os-heading{justify-items:center;text-align:center}
.os-align-center .os-heading__main,.os-malign-center .os-heading__main{justify-items:center}

.os-divider{--div-line:var(--os-color-border);display:flex;align-items:center;justify-content:center;gap:var(--os-space-sm);margin-inline:auto;color:var(--div-c,var(--os-color-accent))}
.os-divider--short{max-inline-size:12rem}
.os-divider--half{max-inline-size:min(100%,32rem)}
.os-divider--lines::before,.os-divider--lines::after,.os-divider--label::before,.os-divider--label::after{content:"";flex:1;height:1px;background:var(--div-line)}
.os-divider__ornament{flex:none;display:block}
.os-divider--ornament .os-divider__ornament{width:3.5rem;height:1.75rem}
.os-divider__label{margin:0;font-family:var(--os-type-eyebrow-font-family);font-size:var(--os-type-eyebrow-font-size);letter-spacing:var(--os-type-eyebrow-letter-spacing);text-transform:var(--os-type-eyebrow-text-transform);font-weight:var(--os-type-eyebrow-font-weight);color:var(--os-color-text-muted);white-space:nowrap}
`;
