import { cx, RichText } from "@omniharmonic/openspace-renderer";
import { defineBlock, f, type RichTextDoc } from "@omniharmonic/openspace-schema";
import { rt, sub } from "../shared";

const tab = (label: string, ...paragraphs: string[]) => ({
  label,
  content: rt.doc(...paragraphs.map((p) => rt.p(p))),
});

export const tabsBlock = defineBlock({
  type: "tabs",
  version: 1,
  category: "text",
  label: "Tabs",
  icon: "panels-top-left",
  description: "Related content in panels; visitors switch between them with tabs.",
  fields: {
    label: f.text({
      maxLength: 80,
      default: "Class styles",
      help: "Names the tab group for screen readers",
    }),
    items: f.list({
      min: 2,
      max: 8,
      itemLabel: "label",
      fields: {
        label: f.text({ maxLength: 40 }),
        content: f.richText({
          marks: ["bold", "italic", "link"],
          blocks: ["paragraph", "heading", "bulletList", "orderedList"],
          maxLength: 2000,
        }),
      },
      default: [
        tab(
          "Foundations",
          "Our slowest class and the best place to start. We break each pose down, explain why it's there and offer options for every body.",
          "Saturdays 9:00 and Tuesdays 18:30 · 75 minutes",
        ),
        tab(
          "Flow",
          "A steady, breath-led vinyasa that builds a little heat. Expect sun salutations, standing balances and a long rest at the end.",
          "Weekdays 7:00 and 12:15 · 60 minutes",
        ),
        tab(
          "Yin & restore",
          "Long, supported holds with bolsters and blankets. Good for stiff hips, busy minds and the evening after a hard week.",
          "Sundays and Thursdays 19:30 · 75 minutes",
        ),
      ],
    }),
  },
  variants: ["underline", "pills", "vertical"],
  styleSlots: ["colorTheme", "padding", "radius", "animation"],
  ai: {
    purpose: "Parallel pieces of content shown one at a time, switched by tabs.",
    whenToUse:
      "Comparable options (class styles, service tiers, menus by meal) where visitors want one at a time. 2–5 tabs with short labels.",
    avoid:
      "Content everyone needs to read (tabs hide it); long labels; sequences (use a timeline) or FAQs (use an accordion).",
  },
  render: ({ id, fields, variant }) => (
    <div
      className={cx("os-tabs", "os-tabsblock", `os-tabsblock--${variant}`)}
      data-os-behavior="tabs"
    >
      <div className="os-tabs__list" role="tablist" aria-label={fields.label}>
        {fields.items.map((item, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            key={i}
            type="button"
            role="tab"
            id={sub(id, `tab${i + 1}`)}
            className="os-tabs__tab"
            aria-controls={sub(id, `panel${i + 1}`)}
            aria-selected={i === 0 ? "true" : "false"}
            tabIndex={i === 0 ? 0 : -1}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="os-tabsblock__panels">
        {fields.items.map((item, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            key={i}
            id={sub(id, `panel${i + 1}`)}
            className="os-tabs__panel"
            role="tabpanel"
            aria-labelledby={sub(id, `tab${i + 1}`)}
          >
            <p className="os-tabsblock__heading os-type-h4">{item.label}</p>
            <RichText doc={item.content as RichTextDoc} />
          </div>
        ))}
      </div>
    </div>
  ),
});

export const tabsCss = `
.os-tabsblock{display:grid;gap:var(--os-space-sm)}
.os-tabsblock .os-tabs__panel{padding-top:0}
.os-tabsblock .os-tabs__panel:focus-visible{outline:2px solid var(--os-color-focus);outline-offset:4px;border-radius:var(--os-radius-sm)}
.os-tabsblock__heading{margin:0 0 var(--os-space-2xs);color:var(--os-color-heading)}
.os-js .os-tabsblock__heading{display:none}
html:not(.os-js) .os-tabsblock .os-tabs__list{display:none}
html:not(.os-js) .os-tabsblock__panels{display:grid;gap:var(--os-space-md)}
.os-tabsblock--pills .os-tabs__list{gap:var(--os-space-3xs);border-bottom:0;padding:0.25rem;background:var(--os-color-surface);border-radius:var(--os-radius-full);justify-self:start;max-inline-size:100%}
.os-tabsblock--pills .os-tabs__tab{padding-inline:1rem;border:0;margin:0;border-radius:var(--os-radius-full)}
.os-tabsblock--pills .os-tabs__tab[aria-selected=true]{background:var(--os-color-background);box-shadow:var(--os-shadow-sm)}
.os-malign-center .os-tabsblock--pills .os-tabs__list{justify-self:center}
@media (min-width:1200px){.os-align-center .os-tabsblock--pills .os-tabs__list{justify-self:center}}
@container block (min-width:44rem){
.os-tabsblock--vertical{grid-template-columns:minmax(10rem,14rem) minmax(0,1fr);gap:var(--os-space-lg);align-items:start}
.os-tabsblock--vertical .os-tabs__list{flex-direction:column;gap:0;border-bottom:0;border-inline-start:1px solid var(--os-color-border)}
.os-tabsblock--vertical .os-tabs__tab{text-align:start;padding:0.6rem var(--os-space-sm);border-bottom:0;margin:0 0 0 -1px;border-inline-start:2px solid transparent}
.os-tabsblock--vertical .os-tabs__tab[aria-selected=true]{border-inline-start-color:var(--os-color-accent)}
}
`;
