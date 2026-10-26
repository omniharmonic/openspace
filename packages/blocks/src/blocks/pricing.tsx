import { Button, cx } from "@openspace/renderer";
import { defineBlock, f, type Link as LinkValue } from "@openspace/schema";
import { Icon } from "../icons";
import { typo } from "../shared";

const features = (...items: string[]) => items.map((text) => ({ text }));

export const pricingBlock = defineBlock({
  type: "pricing",
  version: 1,
  category: "commerce",
  label: "Pricing table",
  icon: "badge-dollar-sign",
  description: "Plans or packages side by side, with prices, inclusions and a button each.",
  fields: {
    plans: f.list({
      min: 1,
      max: 5,
      itemLabel: "name",
      fields: {
        name: f.text({ maxLength: 60 }),
        price: f.text({ maxLength: 24, help: "As shown, with currency, e.g. '$129' or 'Free'" }),
        period: f.text({ optional: true, maxLength: 30, help: "e.g. '/ month' or 'per class'" }),
        description: f.text({ optional: true, multiline: true, maxLength: 200 }),
        features: f.list({
          max: 12,
          itemLabel: "text",
          fields: { text: f.text({ maxLength: 120 }) },
        }),
        buttonLabel: f.text({ optional: true, maxLength: 30 }),
        link: f.link({ optional: true }),
        featured: f.boolean({ default: false, help: "Highlight this plan" }),
        badge: f.text({ optional: true, maxLength: 24, help: "e.g. 'Most popular'" }),
      },
      default: [
        {
          name: "Drop-in",
          price: "$24",
          period: "per class",
          description: "Come when it suits you.",
          features: features("Any group class", "Mats and props included"),
          buttonLabel: "Book a class",
          link: { type: "url", url: "/schedule" },
          featured: false,
        },
        {
          name: "Unlimited",
          price: "$129",
          period: "/ month",
          description: "For a steady weekly practice.",
          features: features(
            "Every group class, every week",
            "Two guest passes a month",
            "10% off workshops and retreats",
            "Pause up to two months a year",
          ),
          buttonLabel: "Start membership",
          link: { type: "url", url: "/membership" },
          featured: true,
          badge: "Most popular",
        },
        {
          name: "Ten classes",
          price: "$190",
          description: "Valid for three months; share with a friend.",
          features: features("Any group class", "Works out at $19 a class"),
          buttonLabel: "Buy a pass",
          link: { type: "url", url: "/passes" },
          featured: false,
        },
      ],
    }),
    note: f.text({
      optional: true,
      maxLength: 200,
      default: "Students, seniors and teachers save 20% — just ask at the desk.",
    }),
  },
  variants: ["cards", "columns", "compact"],
  styleSlots: ["colorTheme", "padding", "radius", "shadow", "animation", "typography.price"],
  ai: {
    purpose: "Compares plans, packages or tiers with prices and what each includes.",
    whenToUse:
      "Pricing, membership and service-package pages. 2–4 plans; mark at most one as featured. Keep inclusions parallel across plans.",
    avoid:
      "Prices the owner hasn't confirmed; hidden fees; more than ~6 inclusions per plan; using it for a single product (use the product block).",
  },
  render: ({ fields, variant, style }) => (
    <div className={cx("os-pricing", `os-pricing--${variant}`)}>
      <ul className="os-pricing__plans" style={{ "--n": fields.plans.length }}>
        {fields.plans.map((plan, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
          <li key={i} className={cx("os-pricing__plan", plan.featured && "is-featured")}>
            <div className="os-pricing__head">
              <h3 className="os-pricing__name os-type-h4">{plan.name}</h3>
              {plan.badge ? <p className="os-pricing__badge">{plan.badge}</p> : null}
            </div>
            <p className="os-pricing__price">
              <span className={cx("os-pricing__amount", typo(style, "price", "h1"))}>
                {plan.price}
              </span>
              {plan.period ? <span className="os-pricing__period">{plan.period}</span> : null}
            </p>
            {plan.description ? <p className="os-pricing__desc">{plan.description}</p> : null}
            {plan.features.length ? (
              <ul className="os-pricing__features">
                {plan.features.map((feat, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
                  <li key={j}>
                    <Icon name="check" size={18} />
                    <span>{feat.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {plan.buttonLabel && plan.link ? (
              <Button
                to={plan.link as LinkValue}
                role={plan.featured ? "primary" : "secondary"}
                className="os-pricing__button"
              >
                {plan.buttonLabel}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {fields.note ? <p className="os-pricing__note">{fields.note}</p> : null}
    </div>
  ),
});

export const pricingCss = `
.os-pricing{display:grid;gap:var(--os-space-sm)}
.os-pricing__plans{display:grid;gap:var(--os-space-sm);margin:0;padding:0;list-style:none}
@container block (min-width:48rem){.os-pricing__plans{grid-template-columns:repeat(var(--n,3),minmax(0,1fr));align-items:stretch}}
.os-pricing__plan{display:flex;flex-direction:column;gap:var(--os-space-xs);padding:var(--os-space-md);border-radius:var(--os-radius-card);min-width:0}
.os-block.has-radius .os-pricing__plan{border-radius:var(--radius)}
.os-pricing__head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--os-space-2xs)}
.os-pricing__name{margin:0;color:var(--os-color-heading)}
.os-pricing__badge{margin:0;padding:0.2em 0.7em;border-radius:var(--os-radius-full);background:var(--os-color-accent);color:var(--os-color-accent-text);font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);white-space:nowrap}
.os-pricing__price{display:flex;flex-wrap:wrap;align-items:baseline;gap:0.35em;margin:0}
.os-pricing__amount{color:var(--os-color-heading);line-height:1;font-variant-numeric:lining-nums}
.os-pricing__period{color:var(--os-color-text-muted)}
.os-pricing__desc{margin:0;color:var(--os-color-text)}
.os-pricing__features{display:grid;gap:0.5em;margin:var(--os-space-2xs) 0 0;padding:var(--os-space-xs) 0 0;list-style:none;border-top:1px solid var(--os-color-border)}
.os-pricing__features li{display:flex;gap:0.6em;align-items:flex-start}
.os-pricing__features .os-icon{flex:none;margin-top:0.15em;color:var(--os-color-accent)}
.os-pricing__button{margin-top:auto;align-self:stretch;justify-content:center}
.os-pricing__features+.os-pricing__button,.os-pricing__desc+.os-pricing__button{margin-top:auto}
.os-pricing__note{margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted);text-align:center}
.os-pricing--cards .os-pricing__plan{background:var(--os-color-surface)}
.os-pricing--cards .os-pricing__plan.is-featured{background:var(--os-color-surface-raised);box-shadow:var(--os-shadow-md);outline:2px solid var(--os-color-accent);outline-offset:-2px}
.os-pricing--columns .os-pricing__plans{gap:0}
.os-pricing--columns .os-pricing__plan{border-radius:0;border-top:1px solid var(--os-color-border)}
@container block (min-width:48rem){.os-pricing--columns .os-pricing__plan{border-top:0;border-inline-start:1px solid var(--os-color-border)}.os-pricing--columns .os-pricing__plan:first-child{border-inline-start:0}}
.os-pricing--columns .os-pricing__plan.is-featured .os-pricing__name{color:var(--os-color-accent)}
.os-pricing--compact .os-pricing__plans{grid-template-columns:minmax(0,1fr);gap:0}
.os-pricing--compact .os-pricing__plan{padding:var(--os-space-sm) 0;border-radius:0;border-bottom:1px solid var(--os-color-border)}
.os-pricing--compact .os-pricing__amount{font-size:var(--os-type-h3-font-size)}
.os-pricing--compact .os-pricing__features{border-top:0;padding-top:0;margin:0;font-size:var(--os-type-small-font-size)}
.os-pricing--compact .os-pricing__button{align-self:start}
@container block (min-width:40rem){
.os-pricing--compact .os-pricing__plan{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:var(--os-space-sm);padding:var(--os-space-sm) 0;border-radius:0;border-bottom:1px solid var(--os-color-border)}
.os-pricing--compact .os-pricing__head,.os-pricing--compact .os-pricing__desc,.os-pricing--compact .os-pricing__features{grid-column:1}
.os-pricing--compact .os-pricing__price{grid-column:2;grid-row:1;justify-content:flex-end}
.os-pricing--compact .os-pricing__button{grid-column:2;grid-row:2 / span 3;align-self:center;margin:0}
}
`;
