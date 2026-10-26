import { cx, Img } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { Icon } from "../icons";
import { DEMO, typo } from "../shared";

export const quoteCarouselBlock = defineBlock({
  type: "quote-carousel",
  version: 1,
  category: "social-proof",
  label: "Quote carousel",
  icon: "messages-square",
  description: "Several testimonials or quotes that visitors swipe through.",
  fields: {
    label: f.text({ maxLength: 80, default: "What members say", help: "Names the carousel" }),
    quotes: f.list({
      min: 1,
      max: 16,
      itemLabel: "name",
      fields: {
        quote: f.text({ multiline: true, maxLength: 400 }),
        name: f.text({ maxLength: 80 }),
        role: f.text({ optional: true, maxLength: 100 }),
        photo: f.image({ optional: true, aspect: "1:1" }),
      },
      default: [
        {
          quote:
            "I came for a stiff back and stayed for the people. Saturday class is the calmest hour of my week.",
          name: "Ana Lucía Torres",
          role: "Member since 2023",
          photo: DEMO.portraitAna,
        },
        {
          quote:
            "Daniel's early flow got me through a winter of night shifts. I leave feeling like I've slept.",
          name: "Priya Raman",
          role: "Night-shift nurse",
        },
        {
          quote:
            "Unfussy, warm and properly taught. My teenage son now asks to come to the Sunday yin class.",
          name: "Tom Becker",
          role: "Member since 2021",
        },
        {
          quote:
            "The Foundations course was the first time anyone explained why a pose matters, not just how to do it.",
          name: "Grace Liu",
          role: "Started in Foundations, 2025",
        },
      ],
    }),
  },
  variants: ["slides", "cards", "minimal"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "animation", "typography.quote"],
  ai: {
    purpose: "Several short quotes from clients or reviews in a swipeable carousel.",
    whenToUse:
      "Social proof when there are four or more good testimonials and little space. `slides` shows one large quote at a time, `cards` several side by side.",
    avoid:
      "Invented or edited quotes; fewer than three quotes (use testimonial); quotes over three sentences.",
  },
  render: ({ id, fields, variant, style }) => {
    const track = `${id}-track`;
    return (
      // biome-ignore lint/a11y/useSemanticElements: ARIA carousel pattern (group + roledescription), not a form fieldset
      <div
        className={cx("os-quotes", `os-quotes--${variant}`, "os-carousel")}
        role="group"
        aria-roledescription="carousel"
        aria-label={fields.label}
        data-os-behavior={fields.quotes.length > 1 ? "carousel" : undefined}
      >
        <ul className="os-carousel__track os-quotes__track" id={track}>
          {fields.quotes.map((q, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
              key={i}
              className="os-quotes__slide"
            >
              <figure className="os-quotes__figure">
                <blockquote
                  className={cx(
                    "os-quotes__quote",
                    typo(style, "quote", variant === "slides" ? "h3" : "lead"),
                  )}
                >
                  <p>{q.quote}</p>
                </blockquote>
                <figcaption className="os-quotes__by">
                  {q.photo ? (
                    <Img
                      src={q.photo}
                      aspect="1:1"
                      treatment="circle"
                      sizes="48px"
                      className="os-quotes__photo"
                    />
                  ) : null}
                  <span className="os-quotes__who">
                    <span className="os-quotes__name">{q.name}</span>
                    {q.role ? <span className="os-quotes__role">{q.role}</span> : null}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        {fields.quotes.length > 1 ? (
          <div className="os-carousel__controls">
            <button
              type="button"
              className="os-carousel__btn"
              data-os-prev=""
              aria-controls={track}
              aria-label="Previous quote"
            >
              <Icon name="arrow-right" size={20} className="os-flip" />
            </button>
            <button
              type="button"
              className="os-carousel__btn"
              data-os-next=""
              aria-controls={track}
              aria-label="Next quote"
            >
              <Icon name="arrow-right" size={20} />
            </button>
          </div>
        ) : null}
      </div>
    );
  },
});

export const quoteCarouselCss = `
.os-quotes__track{margin:0;padding:0;list-style:none}
.os-quotes__slide{display:flex}
.os-quotes__figure{display:grid;align-content:space-between;gap:var(--os-space-sm);margin:0;width:100%}
.os-quotes__quote{margin:0;color:var(--os-color-heading);text-wrap:pretty}
.os-quotes__quote p{margin:0}
.os-quotes__by{display:flex;align-items:center;gap:var(--os-space-xs)}
.os-quotes__photo{flex:none;width:3rem;height:3rem}
.os-quotes__who{display:grid;line-height:1.3}
.os-quotes__name{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-quotes__role{font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-quotes--slides{--slide:100%}
.os-quotes--slides .os-quotes__figure{justify-items:center;text-align:center;padding-inline:clamp(0rem,6cqi,4rem)}
.os-quotes--slides .os-quotes__quote{max-inline-size:36ch;text-wrap:balance}
.os-quotes--slides .os-quotes__quote::before{content:"“";display:block;height:0.55em;font-family:var(--os-font-heading);font-size:2.6em;line-height:1;color:var(--os-color-accent)}
.os-quotes--slides .os-carousel__controls{justify-content:center}
.os-quotes--cards .os-quotes__figure{padding:var(--os-space-md);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-quotes--cards .os-quotes__figure{border-radius:var(--radius)}
.os-quotes--minimal .os-quotes__figure{padding-top:var(--os-space-sm);border-top:2px solid var(--os-color-accent)}
`;
