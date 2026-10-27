import { Button, cx } from "@omniharmonic/openspace-renderer";
import { defineBlock, f, type Link as LinkValue } from "@omniharmonic/openspace-schema";
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
        altPrice: f.text({
          optional: true,
          maxLength: 24,
          help: "Price for the second billing period (shown when the toggle is switched)",
        }),
        altPeriod: f.text({ optional: true, maxLength: 30, help: "e.g. '/ month, billed yearly'" }),
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
    periodLabel: f.text({
      optional: true,
      maxLength: 20,
      help: "Billing toggle: name of the main prices, e.g. 'Monthly'",
    }),
    altPeriodLabel: f.text({
      optional: true,
      maxLength: 20,
      help: "Billing toggle: name of the second prices, e.g. 'Yearly'. Plans need a second price.",
    }),
    altNote: f.text({
      optional: true,
      maxLength: 24,
      help: "Short note beside the second option, e.g. 'Save 20%'",
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
  render: ({ id, fields, variant, style }) => {
    const toggle =
      !!fields.periodLabel && !!fields.altPeriodLabel && fields.plans.some((p) => p.altPrice);
    return (
      <div className={cx("os-pricing", `os-pricing--${variant}`, toggle && "has-toggle")}>
        {toggle ? (
          <fieldset className="os-pricing__toggle">
            <legend className="os-visually-hidden">Billing period</legend>
            <input
              type="radio"
              className="os-pricing__radio is-main"
              id={`${id}-main`}
              name={`${id}-billing`}
              defaultChecked
            />
            <label htmlFor={`${id}-main`}>{fields.periodLabel}</label>
            <input
              type="radio"
              className="os-pricing__radio is-alt"
              id={`${id}-alt`}
              name={`${id}-billing`}
            />
            <label htmlFor={`${id}-alt`}>
              {fields.altPeriodLabel}
              {fields.altNote ? <span className="os-pricing__save">{fields.altNote}</span> : null}
            </label>
          </fieldset>
        ) : null}
        <ul className="os-pricing__plans" style={planColumns(fields.plans.length)}>
          {fields.plans.map((plan, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            <li key={i} className={cx("os-pricing__plan", plan.featured && "is-featured")}>
              <div className="os-pricing__head">
                <h3 className="os-pricing__name os-type-h4">{plan.name}</h3>
                {plan.badge ? <p className="os-pricing__badge">{plan.badge}</p> : null}
              </div>
              <p
                className={cx(
                  "os-pricing__price",
                  toggle && "is-main",
                  toggle && plan.altPrice && "has-alt",
                )}
              >
                <span className={cx("os-pricing__amount", typo(style, "price", "h1"))}>
                  {plan.price}
                </span>
                {plan.period ? <span className="os-pricing__period">{plan.period}</span> : null}
              </p>
              {toggle && plan.altPrice ? (
                <p className="os-pricing__price is-alt">
                  <span className={cx("os-pricing__amount", typo(style, "price", "h1"))}>
                    {plan.altPrice}
                  </span>
                  {plan.altPeriod ? (
                    <span className="os-pricing__period">{plan.altPeriod}</span>
                  ) : null}
                </p>
              ) : null}
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
    );
  },
});

export const pricingCss = `
.os-pricing{display:grid;gap:var(--os-space-sm)}
.os-pricing__plans{display:grid;gap:var(--os-space-sm);margin:0;padding:0;list-style:none}
@container block (min-width:48rem){.os-pricing__plans{grid-template-columns:repeat(var(--pc-md,2),minmax(0,1fr));align-items:stretch}}
@container block (min-width:64rem){.os-pricing__plans{grid-template-columns:repeat(var(--pc-lg,3),minmax(0,1fr))}}
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
.os-pricing__toggle{display:inline-flex;justify-self:center;margin:0 0 var(--os-space-xs);padding:4px;border:1px solid var(--os-color-border);border-radius:var(--os-radius-full);background:var(--os-color-surface);min-width:0}
.os-pricing__radio{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.os-pricing__toggle label{display:inline-flex;align-items:center;gap:0.5em;min-height:44px;padding:0.4em 1.1em;border-radius:var(--os-radius-full);color:var(--os-color-text);font-weight:var(--os-font-weight-strong);cursor:pointer}
.os-pricing__radio:checked+label{background:var(--os-color-surface-raised);color:var(--os-color-heading);box-shadow:var(--os-shadow-sm)}
.os-pricing__radio:focus-visible+label{outline:2px solid var(--os-color-focus);outline-offset:2px}
.os-pricing__save{padding:0.1em 0.6em;border-radius:var(--os-radius-full);background:var(--os-color-accent);color:var(--os-color-accent-text);font-size:var(--os-type-small-font-size)}
.os-pricing__price.is-alt{display:none}
.os-pricing:has(.os-pricing__radio.is-alt:checked) .os-pricing__price.is-alt{display:flex}
.os-pricing:has(.os-pricing__radio.is-alt:checked) .os-pricing__price.has-alt{display:none}
.os-pricing__note{margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted);text-align:center}
.os-pricing--cards .os-pricing__plan{background:var(--os-color-surface)}
.os-pricing--cards .os-pricing__plan.is-featured{background:var(--os-color-surface-raised);box-shadow:var(--os-shadow-md);outline:2px solid var(--os-color-accent);outline-offset:-2px}
.os-pricing--columns .os-pricing__plans{gap:0}
.os-pricing--columns .os-pricing__plan{border-radius:0;border-top:1px solid var(--os-color-border)}
@container block (min-width:48rem){.os-pricing--columns .os-pricing__plan{border-top:0;border-inline-start:1px solid var(--os-color-border)}.os-pricing--columns .os-pricing__plan:first-child{border-inline-start:0}}
.os-pricing--columns .os-pricing__plan.is-featured .os-pricing__name{color:var(--os-color-link)}
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

/**
 * Columns per row for n plans, never leaving one plan alone on a row: medium boxes show 1–3
 * plans side by side, 4 as 2 × 2 and 5 as 3 + 2; wide boxes show up to 4 in a row, 5 as 3 + 2.
 */
export function planColumns(n: number): Record<string, number> {
  const md = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
  const lg = n <= 4 ? Math.max(1, n) : 3;
  return { "--n": n, "--pc-md": md, "--pc-lg": lg };
}
