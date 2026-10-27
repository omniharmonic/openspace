import { cx, jsonForScript, RichText } from "@omniharmonic/openspace-renderer";
import { defineBlock, f, plainText, type RichTextDoc } from "@omniharmonic/openspace-schema";
import { rt, sub, typo } from "../shared";

const faq = (question: string, ...answer: string[]) => ({
  question,
  answer: rt.doc(...answer.map((a) => rt.p(a))),
});

export const accordionBlock = defineBlock({
  type: "accordion",
  version: 1,
  category: "text",
  label: "Accordion / FAQ",
  icon: "list-collapse",
  description: "Questions and answers that expand in place, with FAQ structured data for search.",
  fields: {
    items: f.list({
      min: 1,
      max: 40,
      itemLabel: "question",
      fields: {
        question: f.text({ maxLength: 160, ai: "Phrase as the visitor would ask it." }),
        answer: f.richText({
          marks: ["bold", "italic", "link"],
          blocks: ["paragraph", "bulletList", "orderedList"],
          maxLength: 1500,
        }),
      },
      default: [
        faq(
          "I've never done yoga before. Where should I start?",
          "Start with Foundations on Saturday mornings. We go slowly, explain every pose and offer plenty of options — no flexibility required.",
        ),
        faq(
          "What should I bring?",
          "Comfortable clothes you can move in and a water bottle. Mats, blocks, straps and blankets are provided, and there's a changing room with lockers.",
        ),
        faq(
          "How do class passes work?",
          "Passes are valid for three months from your first class and can be used for any group class on the schedule. Unused classes can be shared with a friend.",
        ),
        faq(
          "Can I cancel a booking?",
          "Yes — cancel up to six hours before class and the credit goes straight back to your pass.",
        ),
      ],
    }),
    exclusive: f.boolean({ default: false, help: "Opening one item closes the others" }),
    openFirst: f.boolean({ default: false, label: "Open the first item" }),
    faqSchema: f.boolean({
      default: true,
      label: "FAQ structured data",
      help: "Helps search engines show your answers (FAQPage)",
    }),
  },
  variants: ["lines", "cards", "minimal"],
  styleSlots: ["colorTheme", "padding", "radius", "border", "animation", "typography.question"],
  ai: {
    purpose: "Expandable questions and answers, with schema.org FAQPage markup.",
    whenToUse:
      "FAQs, policies, class or service details — anything visitors scan for one answer. 4–10 items works best.",
    avoid:
      "Hiding essential information (prices, hours) only inside an accordion; answers longer than a short paragraph or list.",
  },
  render: ({ id, fields, variant, style }) => {
    const exclusiveName = fields.exclusive ? sub(id, "group") : undefined;
    const jsonLd = fields.faqSchema
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: fields.items.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: plainText(item.answer as RichTextDoc) },
          })),
        }
      : undefined;
    return (
      <div
        className={cx("os-accordion", `os-accordion--${variant}`)}
        data-os-behavior="accordion"
        data-os-exclusive={fields.exclusive ? "" : undefined}
      >
        {fields.items.map((item, i) => (
          <details
            // biome-ignore lint/suspicious/noArrayIndexKey: items have no ids; order is the identity
            key={i}
            id={sub(id, `q${i + 1}`)}
            className="os-accordion__item"
            name={exclusiveName}
            open={(fields.openFirst && i === 0) || undefined}
          >
            <summary className={cx("os-accordion__summary", typo(style, "question", "h4"))}>
              <span>{item.question}</span>
            </summary>
            <div className="os-accordion__content">
              <RichText doc={item.answer as RichTextDoc} />
            </div>
          </details>
        ))}
        {jsonLd ? (
          <script
            type="application/ld+json"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped JSON-LD (jsonForScript)
            dangerouslySetInnerHTML={{ __html: jsonForScript(jsonLd) }}
          />
        ) : null}
      </div>
    );
  },
});

export const accordionCss = `
.os-accordion{display:grid}
.os-accordion__summary{cursor:pointer}
.os-accordion__summary>span{flex:1}
.os-accordion__content{color:var(--os-color-text)}
.os-accordion__content .os-rich{padding-inline-end:2rem}
.os-accordion--lines{border-top:1px solid var(--os-color-text-muted)}
.os-accordion--cards{gap:var(--os-space-2xs)}
.os-accordion--cards .os-accordion__item{border:0;border-radius:var(--os-radius-card);background:var(--os-color-surface);padding-inline:var(--os-space-sm);transition:background-color var(--os-motion-duration-base) var(--os-motion-ease)}
.os-accordion--cards .os-accordion__item[open]{background:var(--os-color-surface-raised);box-shadow:var(--os-shadow-sm)}
.os-block.has-radius .os-accordion--cards .os-accordion__item{border-radius:var(--radius)}
.os-accordion--minimal .os-accordion__item{border-bottom-color:var(--os-color-border)}
.os-accordion--minimal .os-accordion__item>summary::after{content:"+";width:auto;height:auto;border:0;rotate:0deg;translate:0 0;font-family:var(--os-font-body);font-weight:300;font-size:1.5em;line-height:1;color:var(--os-color-accent);transition:rotate var(--os-motion-duration-base) var(--os-motion-ease)}
.os-accordion--minimal .os-accordion__item[open]>summary::after{rotate:45deg;translate:0 0}
`;
