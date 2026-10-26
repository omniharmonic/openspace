import { cx } from "@openspace/renderer";
import { defineBlock, f, SPACE_TOKENS } from "@openspace/schema";
import { colorVar } from "@openspace/theme";
import type { ReactNode } from "react";

/** Line, spacer and shape: small structural and decorative blocks. */

const spaceVar = (t: string) => `var(--os-space-${t})`;

export const lineBlock = defineBlock({
  type: "line",
  version: 1,
  category: "layout",
  label: "Line",
  icon: "minus",
  description: "A horizontal rule in a token color.",
  fields: {
    thickness: f.select({
      options: [
        { value: "hairline", label: "Hairline" },
        { value: "regular", label: "Regular" },
        { value: "bold", label: "Bold" },
      ],
      default: "hairline",
      display: "segmented",
    }),
    length: f.select({
      options: [
        { value: "full", label: "Full width" },
        { value: "half", label: "Half" },
        { value: "short", label: "Short accent" },
      ],
      default: "full",
      display: "segmented",
    }),
    color: f.color({ default: "border", help: "A palette color" }),
  },
  variants: ["solid", "dashed", "dotted", "fade"],
  styleSlots: ["padding", "align", "animation"],
  ai: {
    purpose: "A visual divider between pieces of content.",
    whenToUse:
      "To separate groups inside a section, or as a short accent rule above a heading (`length: short`, color `accent`).",
    avoid: "Lines between every block; using lines where whitespace or a section change would do.",
  },
  render: ({ fields, variant }) => (
    <hr
      className={cx("os-line", `os-line--${variant}`, `os-line--${fields.length}`)}
      style={{
        "--line-c": `var(${colorVar(fields.color)})`,
        "--line-w":
          fields.thickness === "bold" ? "4px" : fields.thickness === "regular" ? "2px" : "1px",
      }}
    />
  ),
});

const SPACER_OPTIONS = SPACE_TOKENS.filter((t) => t !== "none" && t !== "3xs" && t !== "2xs").map(
  (t) => ({ value: t, label: t.toUpperCase() }),
);

export const spacerBlock = defineBlock({
  type: "spacer",
  version: 1,
  category: "layout",
  label: "Spacer",
  icon: "move-vertical",
  description: "Vertical breathing room from the spacing scale.",
  fields: {
    height: f.select({
      options: SPACER_OPTIONS,
      default: "lg",
      help: "Height on tablet and desktop",
    }),
    mobileHeight: f.select({
      options: SPACER_OPTIONS,
      optional: true,
      label: "Height on phones",
      help: "Defaults to one step smaller",
    }),
  },
  ai: {
    purpose: "Extra vertical space between blocks, sized from the site's spacing scale.",
    whenToUse: "Sparingly, to give a heading or image more air than the default block gap.",
    avoid: "Stacking spacers; using spacers to fake section padding (adjust the section instead).",
  },
  render: ({ fields }) => {
    const steps = SPACER_OPTIONS.map((o) => o.value);
    const smaller = steps[Math.max(0, steps.indexOf(fields.height) - 1)] ?? fields.height;
    return (
      <div
        className="os-spacer"
        aria-hidden="true"
        style={{
          "--sp": spaceVar(fields.height),
          "--msp": spaceVar(fields.mobileHeight ?? smaller),
        }}
      />
    );
  },
});

// --- shapes -------------------------------------------------------------------------------------

/** A scalloped circle ("flower") path with `n` lobes. */
function scallop(n: number, cx: number, cy: number, radius: number): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  });
  const chord = 2 * radius * Math.sin(Math.PI / n);
  const r = (chord / 2) * 1.08;
  const fmt = (v: number) => Math.round(v * 100) / 100;
  const [first] = pts;
  if (!first) return "";
  let d = `M${fmt(first[0])} ${fmt(first[1])}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n] as readonly [number, number];
    d += `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(p[0])} ${fmt(p[1])}`;
  }
  return `${d}Z`;
}

interface ShapeDef {
  label: string;
  viewBox: string;
  /** Drawn with a stroke only, in every variant. */
  line?: boolean;
  node: ReactNode;
}

const SHAPES = {
  circle: { label: "Circle", viewBox: "0 0 200 200", node: <circle cx="100" cy="100" r="96" /> },
  ring: {
    label: "Ring",
    viewBox: "0 0 200 200",
    line: true,
    node: <circle cx="100" cy="100" r="88" />,
  },
  blob: {
    label: "Organic blob",
    viewBox: "0 0 200 200",
    node: (
      <path d="M104 6c30 1 58 15 74 40s20 56 10 84-34 52-64 62-62 4-86-16S6 120 8 92s18-54 40-70S78 5 104 6z" />
    ),
  },
  arch: {
    label: "Arch",
    viewBox: "0 0 160 200",
    node: <path d="M0 200V80a80 80 0 0 1 160 0v120z" />,
  },
  "half-circle": {
    label: "Half circle",
    viewBox: "0 0 200 100",
    node: <path d="M0 100a100 100 0 0 1 200 0z" />,
  },
  pill: {
    label: "Pill",
    viewBox: "0 0 200 100",
    node: <rect x="0" y="0" width="200" height="100" rx="50" />,
  },
  squircle: {
    label: "Soft square",
    viewBox: "0 0 200 200",
    node: <path d="M100 4c78 0 96 18 96 96s-18 96-96 96S4 178 4 100 22 4 100 4z" />,
  },
  triangle: { label: "Triangle", viewBox: "0 0 200 180", node: <path d="M100 4l96 172H4z" /> },
  sparkle: {
    label: "Sparkle",
    viewBox: "0 0 200 200",
    node: (
      <path d="M100 0c6 58 36 88 100 100-64 12-94 42-100 100-6-58-36-88-100-100C64 88 94 58 100 0z" />
    ),
  },
  star: {
    label: "Star",
    viewBox: "0 0 200 190",
    node: <path d="M100 4l28 60 66 8-49 45 13 65-58-33-58 33 13-65L6 72l66-8z" />,
  },
  flower: { label: "Flower", viewBox: "0 0 200 200", node: <path d={scallop(8, 100, 100, 74)} /> },
  wave: {
    label: "Squiggle",
    viewBox: "0 0 200 40",
    line: true,
    node: <path d="M4 20c16-20 32-20 48 0s32 20 48 0 32-20 48 0 32 20 48 0" />,
  },
} satisfies Record<string, ShapeDef>;

type ShapeName = keyof typeof SHAPES;
const SHAPE_NAMES = Object.keys(SHAPES) as ShapeName[];

export const shapeBlock = defineBlock({
  type: "shape",
  version: 1,
  category: "layout",
  label: "Shape",
  icon: "shapes",
  description: "A decorative SVG shape in a palette color.",
  fields: {
    shape: f.select({
      options: SHAPE_NAMES.map((value) => ({ value, label: SHAPES[value].label })),
      default: "blob",
    }),
    color: f.color({ default: "accent-200", help: "A palette color" }),
    size: f.select({
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "fill", label: "Fill the space" },
      ],
      default: "md",
      display: "segmented",
    }),
    rotate: f.number({ default: 0, min: -180, max: 180, step: 15, unit: "°", integer: true }),
    stretch: f.boolean({
      default: false,
      help: "Stretch to fill a grid cell instead of keeping proportions",
    }),
  },
  variants: ["solid", "outline", "soft"],
  styleSlots: ["align", "padding", "animation"],
  ai: {
    purpose: "Decorative shapes (blob, arch, sparkle, squiggle…) in palette colors.",
    whenToUse:
      "In grid sections, layered behind or beside images and text to add warmth and brand character. Keep to one or two per section.",
    avoid:
      "Using shapes to carry meaning or text; bright shapes behind body text that hurt contrast.",
  },
  render: ({ fields, variant }) => {
    const def: ShapeDef = SHAPES[fields.shape as ShapeName] ?? SHAPES.blob;
    return (
      <div
        className={cx(
          "os-shape",
          `os-shape--${variant}`,
          `os-shape--${fields.size}`,
          def.line && "is-line",
        )}
        style={{
          "--shape-c": `var(${colorVar(fields.color)})`,
          "--shape-r": fields.rotate ? `${fields.rotate}deg` : undefined,
        }}
        aria-hidden="true"
      >
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative; the wrapper is aria-hidden */}
        <svg
          className="os-shape__svg"
          viewBox={def.viewBox}
          preserveAspectRatio={fields.stretch ? "none" : "xMidYMid meet"}
          focusable="false"
        >
          {def.node}
        </svg>
      </div>
    );
  },
});

export const decorCss = `
.os-line{margin:0;border:0;height:var(--line-w,1px);background:var(--line-c);color:var(--line-c)}
.os-line--half{width:50%}
.os-line--short{width:min(4rem,30%)}
.os-malign-center>.os-line,.os-malign-center .os-line{margin-inline:auto}
.os-malign-end>.os-line,.os-malign-end .os-line{margin-inline-start:auto}
@media (min-width:1200px){.os-align-start .os-line{margin-inline:0}.os-align-center .os-line{margin-inline:auto}.os-align-end .os-line{margin-inline:auto 0}}
.os-line--dashed{background:repeating-linear-gradient(90deg,var(--line-c) 0 0.75rem,transparent 0.75rem 1.25rem)}
.os-line--dotted{height:max(var(--line-w,1px),3px);background:radial-gradient(circle,var(--line-c) calc(var(--line-w,1px) * 0.5 + 0.75px),transparent calc(var(--line-w,1px) * 0.5 + 1px)) 0 50%/0.6rem 100% repeat-x}
.os-line--fade{background:linear-gradient(90deg,transparent,var(--line-c) 20%,var(--line-c) 80%,transparent)}
.os-spacer{height:var(--msp,var(--os-space-md))}
@media (min-width:768px){.os-spacer{height:var(--sp,var(--os-space-lg))}}
.os-shape{display:flex;justify-content:center;align-items:center;height:100%;color:var(--shape-c)}
.os-shape__svg{width:100%;height:100%;max-height:100%;overflow:visible;fill:currentColor;rotate:var(--shape-r,0deg)}
.os-shape--sm .os-shape__svg{width:min(100%,6rem)}
.os-shape--md .os-shape__svg{width:min(100%,14rem)}
.os-shape--lg .os-shape__svg{width:min(100%,26rem)}
.os-shape--fill{min-height:4rem}
.os-shape--outline .os-shape__svg,.os-shape.is-line .os-shape__svg{fill:none;stroke:currentColor;stroke-width:2.5;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.os-shape.is-line .os-shape__svg{stroke-width:4}
.os-shape--soft{opacity:0.45}
`;
