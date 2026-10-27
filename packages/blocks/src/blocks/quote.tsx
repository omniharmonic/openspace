import { cx, Img, RichText } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";
import { DEMO, rt, typo } from "../shared";

export const quoteBlock = defineBlock({
  type: "quote",
  version: 1,
  category: "text",
  label: "Quote",
  icon: "quote",
  description: "A pull quote or epigraph with attribution.",
  fields: {
    quote: f.richText({
      marks: ["bold", "italic"],
      blocks: ["paragraph"],
      maxLength: 400,
      default: rt.doc(
        rt.p("The body benefits from movement, and the mind benefits from stillness."),
      ),
      ai: "Quote real words only, attributed correctly. 1–3 sentences.",
    }),
    attribution: f.text({ optional: true, maxLength: 80, default: "Sakyong Mipham" }),
    source: f.text({ optional: true, maxLength: 120, help: "Book, talk or publication" }),
  },
  variants: ["classic", "large", "bar"],
  styleSlots: [
    "colorTheme",
    "padding",
    "align",
    "radius",
    "border",
    "animation",
    "typography.quote",
  ],
  defaults: { fields: { source: "Running with the Mind of Meditation" } },
  ai: {
    purpose: "A short, memorable quotation set apart from body text.",
    whenToUse:
      "To pause the reader between sections, or to open a page with an epigraph. `large` is a centred statement, `bar` sits inside reading text.",
    avoid:
      "Customer reviews (use testimonial); misattributed or invented quotes; quotes longer than three sentences.",
  },
  render: ({ fields, variant, style }) => (
    <figure className={cx("os-quote", `os-quote--${variant}`)}>
      {variant === "classic" ? (
        <span className="os-quote__mark" aria-hidden="true">
          “
        </span>
      ) : null}
      <blockquote
        className={cx(
          "os-quote__text",
          typo(style, "quote", variant === "large" ? "h2" : variant === "bar" ? "lead" : "h3"),
        )}
      >
        <RichText doc={fields.quote} />
      </blockquote>
      {fields.attribution || fields.source ? (
        <figcaption className="os-quote__by">
          {fields.attribution ? <span className="os-quote__name">{fields.attribution}</span> : null}
          {fields.source ? <cite className="os-quote__source">{fields.source}</cite> : null}
        </figcaption>
      ) : null}
    </figure>
  ),
});

export const testimonialBlock = defineBlock({
  type: "testimonial",
  version: 1,
  category: "social-proof",
  label: "Testimonial",
  icon: "message-square-quote",
  description: "A client's words, attributed to a named person, with optional photo and rating.",
  fields: {
    quote: f.richText({
      marks: ["bold", "italic"],
      blocks: ["paragraph"],
      maxLength: 600,
      default: rt.doc(
        rt.p(
          "I came for a stiff back and stayed for the people. Two years on, Saturday class is the calmest hour of my week — and my back hasn't complained since spring.",
        ),
      ),
      ai: "The client's real words. Never write or embellish testimonials; ask the owner.",
    }),
    name: f.text({ maxLength: 80, default: "Ana Lucía Torres" }),
    role: f.text({ optional: true, maxLength: 100, help: "e.g. 'Member since 2023' or a company" }),
    photo: f.image({ optional: true, aspect: "1:1" }),
    rating: f.number({ optional: true, min: 0, max: 5, step: 0.5, help: "Stars out of 5" }),
  },
  variants: ["card", "large", "minimal"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "border",
    "shadow",
    "align",
    "animation",
    "typography.quote",
  ],
  defaults: {
    variant: "card",
    fields: { role: "Member since 2023", photo: DEMO.portraitAna, rating: 5 },
  },
  ai: {
    purpose: "A short quote from a client or customer, attributed to a named person.",
    whenToUse:
      "Social proof near a call to action or on a services page. Use three side by side (`card`) or one `large` testimonial as a section's centrepiece.",
    avoid:
      "Inventing testimonials or ratings. Ask the owner for real quotes and permission to use names and photos.",
  },
  render: ({ fields, variant, style }) => (
    <figure className={cx("os-testimonial", `os-testimonial--${variant}`)}>
      {fields.rating !== undefined && fields.rating > 0 ? <Stars value={fields.rating} /> : null}
      <blockquote
        className={cx(
          "os-testimonial__quote",
          typo(
            style,
            "quote",
            variant === "large" ? "h3" : variant === "minimal" ? "body" : "lead",
          ),
        )}
      >
        <RichText doc={fields.quote} />
      </blockquote>
      <figcaption className="os-testimonial__by">
        {fields.photo ? (
          <Img
            src={fields.photo}
            sizes="64px"
            aspect="1:1"
            treatment="circle"
            className="os-testimonial__photo"
          />
        ) : null}
        <span className="os-testimonial__who">
          <span className="os-testimonial__name">{fields.name}</span>
          {fields.role ? <span className="os-testimonial__role">{fields.role}</span> : null}
        </span>
      </figcaption>
    </figure>
  ),
});

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <p className="os-stars" role="img" aria-label={`Rated ${rounded} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = rounded >= i + 1 ? "full" : rounded >= i + 0.5 ? "half" : "empty";
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
            className={`os-star is-${fill}`}
          >
            <path
              d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"
              fill={fill === "empty" ? "none" : "currentColor"}
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
              style={fill === "half" ? { clipPath: "inset(0 50% 0 0)" } : undefined}
            />
            {fill === "half" ? (
              <path
                d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>
        );
      })}
    </p>
  );
}

export const quoteCss = `
.os-quote{position:relative;display:grid;gap:var(--os-space-xs);margin:0}
.os-quote__text{margin:0;color:var(--os-color-heading);text-wrap:balance}
.os-quote__text .os-rich>*{max-inline-size:none}
.os-quote__by{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.25em 0.6em;font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-quote__name{font-weight:var(--os-font-weight-strong);color:var(--os-color-text)}
.os-quote__name::before{content:"— "}
.os-quote__source{font-style:italic}
.os-quote--classic .os-quote__mark{display:block;height:0.5em;font-family:var(--os-font-heading);font-size:clamp(4rem,10cqi,6.5rem);line-height:0.9;color:var(--os-color-accent)}
.os-quote--large{text-align:center;justify-items:center;padding-block:var(--os-space-sm)}
.os-quote--large .os-quote__text{max-inline-size:30ch}
.os-quote--large .os-quote__by{justify-content:center}
.os-quote--large .os-quote__name::before{content:none}
.os-quote--large::before{content:"";width:2.5rem;height:2px;background:var(--os-color-accent);margin-bottom:var(--os-space-xs)}
.os-quote--bar{padding-inline-start:var(--os-space-sm);border-inline-start:3px solid var(--os-color-accent)}
.os-quote--bar .os-quote__text{font-style:italic}

.os-testimonial{display:grid;align-content:start;gap:var(--os-space-sm);margin:0;height:100%}
.os-testimonial__quote{margin:0;color:var(--os-color-heading)}
.os-testimonial__quote .os-rich>*{max-inline-size:none}
.os-testimonial__by{display:flex;align-items:center;gap:var(--os-space-xs);margin-top:auto}
.os-testimonial__photo{flex:none;width:3.25rem;height:3.25rem}
.os-testimonial__who{display:grid;gap:0.1em;line-height:1.3}
.os-testimonial__name{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-testimonial__role{font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-testimonial--card{padding:var(--os-space-md);background:var(--os-color-surface-raised);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-testimonial--card{border-radius:var(--radius)}
.os-block.os-themed .os-testimonial--card{background:transparent;padding:0}
.os-testimonial--large{justify-items:center;text-align:center;gap:var(--os-space-md)}
.os-testimonial--large .os-testimonial__quote{max-inline-size:34ch;text-wrap:balance}
.os-testimonial--large .os-testimonial__by{flex-direction:column;gap:var(--os-space-2xs);margin-top:0}
.os-testimonial--large .os-testimonial__photo{width:4.5rem;height:4.5rem}
.os-testimonial--minimal{gap:var(--os-space-xs);padding-top:var(--os-space-sm);border-top:1px solid var(--os-color-border)}
.os-testimonial--minimal .os-testimonial__quote{color:var(--os-color-text)}
.os-testimonial--minimal .os-testimonial__photo{width:2.5rem;height:2.5rem}
.os-stars{display:flex;gap:0.15rem;color:var(--os-color-accent);margin:0}
.os-testimonial--large .os-stars{justify-content:center}
`;
