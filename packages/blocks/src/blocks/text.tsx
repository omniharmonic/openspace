import { cx, RichText } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { rt } from "../shared";

export const textBlock = defineBlock({
  type: "text",
  version: 1,
  category: "text",
  label: "Text",
  icon: "type",
  description: "Headings, paragraphs, lists and quotes with the site's type presets.",
  fields: {
    content: f.richText({
      label: "Text",
      ai: "Write in the owner's voice. Use one heading level per block; keep paragraphs to 2–4 sentences.",
      default: rt.doc(
        rt.h(2, "A slower kind of morning"),
        rt.p(
          "We opened our doors in 2014 with six mats and a kettle. Today the room is a little bigger, but the idea is the same: small classes, unhurried teaching and enough time afterwards for tea and conversation.",
        ),
        rt.p([
          "New here? Start with ",
          rt.bold("Foundations on Saturday mornings"),
          " — no experience needed, and mats are on us.",
        ]),
      ),
    }),
  },
  variants: ["default", "columns", "drop-cap", "callout"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "border", "animation"],
  ai: {
    purpose: "Running text: headings, paragraphs, lists and pull quotes.",
    whenToUse:
      "Any time words carry the section — introductions, stories, policies. Use `columns` for long reading text, `drop-cap` for editorial openings, `callout` for a note that must stand out.",
    avoid:
      "Walls of text; more than one H1 per page; using bold paragraphs as fake headings. Use the button block for calls to action.",
  },
  render: ({ fields, variant }) => (
    <RichText doc={fields.content} className={cx("os-text", `os-text--${variant}`)} />
  ),
});

export const textCss = `
.os-text--columns{columns:1;column-gap:var(--os-space-lg)}
@container block (min-width:46rem){.os-text--columns{columns:2}.os-text--columns>*{break-inside:avoid-column}.os-text--columns>:is(h1,h2,h3,h4){column-span:all}}
.os-text--drop-cap>p:first-of-type::first-letter{float:inline-start;font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:3.4em;line-height:0.85;margin:0.06em 0.12em 0 0;color:var(--os-color-accent)}
.os-text--callout{padding:var(--os-space-sm) var(--os-space-md);background:var(--os-color-surface);border-inline-start:3px solid var(--os-color-accent);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-text--callout{border-radius:var(--radius)}
`;
