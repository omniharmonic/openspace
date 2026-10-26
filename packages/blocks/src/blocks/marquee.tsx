import { cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";

const SEPARATORS = {
  dot: "•",
  star: "✦",
  slash: "/",
  dash: "—",
  none: "",
} as const;

const SPEEDS = { slow: 22, medium: 40, fast: 70 } as const;

export const marqueeBlock = defineBlock({
  type: "marquee",
  version: 1,
  category: "text",
  label: "Scrolling text",
  icon: "move-horizontal",
  description: "A line of words that scrolls continuously across the page (pauses on hover).",
  fields: {
    items: f.list({
      min: 1,
      max: 16,
      itemLabel: "text",
      fields: { text: f.text({ maxLength: 60 }) },
      default: [
        { text: "Slow yoga" },
        { text: "Sound baths" },
        { text: "Breathwork" },
        { text: "Saturday foundations" },
        { text: "Pearl Street, Boulder" },
      ],
    }),
    separator: f.select({
      options: [
        { value: "star", label: "Star ✦" },
        { value: "dot", label: "Dot •" },
        { value: "slash", label: "Slash /" },
        { value: "dash", label: "Dash —" },
        { value: "none", label: "None" },
      ],
      default: "star",
    }),
    size: f.select({
      options: [
        { value: "lead", label: "Small" },
        { value: "h3", label: "Medium" },
        { value: "h2", label: "Large" },
        { value: "display", label: "Huge" },
      ],
      default: "h2",
      display: "segmented",
    }),
    speed: f.select({
      options: ["slow", "medium", "fast"],
      default: "medium",
      display: "segmented",
    }),
  },
  variants: ["text", "outline", "band"],
  styleSlots: ["colorTheme", "padding", "animation"],
  ai: {
    purpose: "A continuously scrolling line of short phrases, like a ticker or a shop-window band.",
    whenToUse:
      "For energy between sections: offerings, places, a short slogan. 3–8 phrases of 1–3 words. `band` sets it on an accent strip.",
    avoid:
      "Essential information (it moves and can be paused); long sentences; more than one per page. It never moves for visitors who prefer reduced motion.",
  },
  render: ({ fields, variant }) => {
    const sep = SEPARATORS[fields.separator];
    return (
      <div
        className={cx("os-marquee", "os-ticker", `os-ticker--${variant}`)}
        data-os-behavior="marquee"
        data-os-speed={SPEEDS[fields.speed]}
      >
        <ul className={cx("os-marquee__track", "os-ticker__track", `os-type-${fields.size}`)}>
          {fields.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            <li key={i} className="os-ticker__item">
              <span>{item.text}</span>
              {sep ? (
                <span className="os-ticker__sep" aria-hidden="true">
                  {sep}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  },
});

export const marqueeCss = `
.os-ticker{padding-block:var(--os-space-2xs)}
.os-ticker .os-marquee__track{gap:0;justify-content:center;margin:0}
.os-ticker.is-running .os-marquee__track{justify-content:flex-start}
.os-ticker__item{display:flex;align-items:center;white-space:nowrap;color:var(--os-color-heading);line-height:1.15}
.os-ticker__sep{display:inline-block;padding-inline:0.6em;color:var(--os-color-link);font-size:0.6em}
.os-ticker--outline .os-ticker__item>span:first-child{color:transparent;-webkit-text-stroke:1.5px var(--os-color-heading)}
.os-ticker--band{background:var(--os-color-accent);padding-block:var(--os-space-xs);border-radius:var(--os-radius-sm)}
.os-ticker--band .os-ticker__item,.os-ticker--band .os-ticker__sep{color:var(--os-color-accent-text)}
.os-block.has-radius .os-ticker--band{border-radius:var(--radius)}
`;
