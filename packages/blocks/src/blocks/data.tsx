import { cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { typo } from "../shared";

/** Stats / numbers and timeline. */

export const statsBlock = defineBlock({
  type: "stats",
  version: 1,
  category: "data",
  label: "Stats",
  icon: "hash",
  description: "A few key numbers with short labels.",
  fields: {
    items: f.list({
      min: 1,
      max: 8,
      itemLabel: "label",
      fields: {
        value: f.text({ maxLength: 16, help: "The number, e.g. '14', '4.9', '2019', '98%'" }),
        label: f.text({ maxLength: 80 }),
        detail: f.text({ optional: true, maxLength: 140 }),
      },
      default: [
        { value: "14", label: "people per class, at most" },
        { value: "6", label: "teachers", detail: "Each with 500+ hours of training." },
        { value: "2019", label: "teaching on Pearl Street since" },
        { value: "4.9", label: "average rating", detail: "From 380 reviews." },
      ],
    }),
  },
  variants: ["row", "cards", "large"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "animation", "typography.value"],
  ai: {
    purpose: "Key figures that make a claim concrete (members, years, ratings, outcomes).",
    whenToUse:
      "On about, services and fundraising pages; 3–4 numbers read best. `large` gives each number its own row.",
    avoid: "Invented, rounded-up or unverifiable figures; more than six stats; vanity numbers.",
  },
  render: ({ fields, variant, style }) => (
    <dl
      className={cx("os-stats", `os-stats--${variant}`)}
      style={{ "--n": Math.min(fields.items.length, 4) }}
    >
      {fields.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
        <div key={i} className="os-stats__item">
          <dt className="os-stats__label">{item.label}</dt>
          <dd
            className={cx(
              "os-stats__value",
              typo(style, "value", variant === "large" ? "display" : "h1"),
            )}
          >
            {item.value}
          </dd>
          {item.detail ? <dd className="os-stats__detail">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  ),
});

export const timelineBlock = defineBlock({
  type: "timeline",
  version: 1,
  category: "data",
  label: "Timeline",
  icon: "milestone",
  description: "Dated milestones in order: a history, a process or a programme.",
  fields: {
    items: f.list({
      min: 1,
      max: 24,
      itemLabel: "title",
      fields: {
        date: f.text({ maxLength: 40, help: "A year, date or step, e.g. '2022' or 'Week 1'" }),
        title: f.text({ maxLength: 100 }),
        text: f.text({ optional: true, multiline: true, maxLength: 400 }),
      },
      default: [
        {
          date: "2019",
          title: "A borrowed living room",
          text: "Maya teaches the first Saturday class to six neighbours, mats squeezed between the sofa and the piano.",
        },
        {
          date: "2020",
          title: "Online, together",
          text: "Classes move to video calls. Forty people practise from their kitchens every morning.",
        },
        {
          date: "2022",
          title: "Teacher training begins",
          text: "Our first 200-hour cohort graduates; four of them still teach on the schedule.",
        },
        {
          date: "2024",
          title: "The Pearl Street studio opens",
          text: "A sunny upstairs room with cork floors, warm light and space for fourteen.",
        },
        {
          date: "2026",
          title: "A second room",
          text: "A quieter space for sound baths, restorative and one-to-one sessions.",
        },
      ],
    }),
  },
  variants: ["vertical", "alternating", "horizontal"],
  styleSlots: ["colorTheme", "padding", "animation", "typography.title"],
  ai: {
    purpose: "A sequence of dated or numbered milestones.",
    whenToUse:
      "Company or project history, a programme's weeks, a process from enquiry to delivery. `horizontal` suits 3–5 short steps.",
    avoid: "Undated lists (use a list or columns); invented history; more than ~10 milestones.",
  },
  render: ({ fields, variant, style }) => (
    <ol className={cx("os-timeline", `os-timeline--${variant}`)}>
      {fields.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
        <li key={i} className="os-timeline__item">
          <p className="os-timeline__date">{item.date}</p>
          <div className="os-timeline__body">
            <h3 className={cx("os-timeline__title", typo(style, "title", "h4"))}>{item.title}</h3>
            {item.text ? <p className="os-timeline__text">{item.text}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  ),
});

export const dataCss = `
.os-stats{display:grid;gap:var(--os-space-md) var(--os-space-sm);grid-template-columns:repeat(2,minmax(0,1fr));margin:0}
@container block (max-width:20rem){.os-stats{grid-template-columns:minmax(0,1fr)}}
@container block (min-width:48rem){.os-stats{grid-template-columns:repeat(var(--n,4),minmax(0,1fr))}}
.os-stats__item{display:flex;flex-direction:column;gap:var(--os-space-3xs);min-width:0}
.os-stats__value{order:-1;margin:0;color:var(--os-color-heading);font-variant-numeric:lining-nums tabular-nums;line-height:1}
.os-stats__label{font-weight:var(--os-font-weight-strong);color:var(--os-color-text);overflow-wrap:break-word}
.os-stats__detail{margin:0;font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-stats--row .os-stats__item{padding-inline-start:var(--os-space-sm);border-inline-start:2px solid var(--os-color-accent)}
.os-stats--cards .os-stats__item{padding:var(--os-space-sm);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-stats--cards .os-stats__item{border-radius:var(--radius)}
.os-stats--large{grid-template-columns:minmax(0,1fr);gap:0}
.os-stats--large .os-stats__item{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);align-items:baseline;column-gap:var(--os-space-md);padding-block:var(--os-space-sm);border-top:1px solid var(--os-color-border)}
.os-stats--large .os-stats__value{grid-row:span 2;color:var(--os-color-accent)}
@container block (max-width:30rem){.os-stats--large .os-stats__item{grid-template-columns:minmax(0,1fr)}.os-stats--large .os-stats__value{grid-row:auto}}
.os-align-center .os-stats__item,.os-malign-center .os-stats__item{align-items:center;text-align:center}

.os-timeline{--dot:0.75rem;display:grid;gap:0;margin:0;padding:0;list-style:none}
.os-timeline__item{position:relative;display:grid;align-content:start;gap:var(--os-space-3xs);padding:0 0 var(--os-space-md) calc(var(--dot) + var(--os-space-sm))}
.os-timeline__item::before{content:"";position:absolute;inset-inline-start:0;top:0.35em;width:var(--dot);height:var(--dot);border-radius:var(--os-radius-full);background:var(--os-color-accent)}
.os-timeline__item::after{content:"";position:absolute;inset-inline-start:calc(var(--dot) / 2 - 1px);top:calc(0.35em + var(--dot) + 0.3rem);bottom:0.3rem;width:2px;background:var(--os-color-border)}
.os-timeline__item:last-child::after{display:none}
.os-timeline__date{margin:0;font-family:var(--os-type-eyebrow-font-family);font-size:var(--os-type-eyebrow-font-size);letter-spacing:var(--os-type-eyebrow-letter-spacing);text-transform:var(--os-type-eyebrow-text-transform);font-weight:var(--os-type-eyebrow-font-weight);color:var(--os-color-link)}
.os-timeline__title{margin:0;color:var(--os-color-heading)}
.os-timeline__text{margin:0.25em 0 0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
@container block (min-width:48rem){
.os-timeline--alternating .os-timeline__item{grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:calc(var(--os-space-lg) + var(--dot));padding-inline-start:0}
.os-timeline--alternating .os-timeline__item::before{inset-inline-start:calc(50% - var(--dot) / 2)}
.os-timeline--alternating .os-timeline__item::after{inset-inline-start:calc(50% - 1px)}
.os-timeline--alternating .os-timeline__date{text-align:end;padding-top:0.1em}
.os-timeline--alternating .os-timeline__item:nth-child(even) .os-timeline__date{order:2;text-align:start}
.os-timeline--alternating .os-timeline__item:nth-child(even) .os-timeline__body{text-align:end}
.os-timeline--alternating .os-timeline__item:nth-child(even) .os-timeline__text{margin-inline-start:auto}
.os-timeline--horizontal{grid-auto-flow:column;grid-auto-columns:minmax(12rem,1fr);overflow-x:auto;gap:var(--os-space-sm);scrollbar-width:thin}
.os-timeline--horizontal .os-timeline__item{padding:calc(var(--dot) + var(--os-space-sm)) 0 var(--os-space-xs)}
.os-timeline--horizontal .os-timeline__item::before{top:0}
.os-timeline--horizontal .os-timeline__item::after{top:calc(var(--dot) / 2 - 1px);bottom:auto;inset-inline-start:calc(var(--dot) + 0.4rem);inset-inline-end:calc(-1 * var(--os-space-sm) + 0.4rem);width:auto;height:2px}
}
`;
