import { cx } from "@openspace/renderer";
import { defineBlock, f } from "@openspace/schema";
import { typo } from "../shared";

/** Dietary marks: short code shown on the menu, full name for screen readers and the legend. */
export const DIETARY = {
  v: { code: "V", name: "Vegetarian" },
  vg: { code: "VG", name: "Vegan" },
  gf: { code: "GF", name: "Gluten-free" },
  df: { code: "DF", name: "Dairy-free" },
  n: { code: "N", name: "Contains nuts" },
  spicy: { code: "S", name: "Spicy" },
} as const;
type Diet = keyof typeof DIETARY;

const DIET_OPTIONS = (Object.keys(DIETARY) as Diet[]).map((value) => ({
  value,
  label: DIETARY[value].name,
}));

const dish = (name: string, price: string, description: string, ...dietary: Diet[]) => ({
  name,
  price,
  description,
  dietary: dietary.map((tag) => ({ tag })),
});

export const restaurantMenuBlock = defineBlock({
  type: "restaurant-menu",
  version: 1,
  category: "text",
  label: "Menu",
  icon: "utensils",
  description: "A food or drinks menu in sections, with prices and dietary marks.",
  fields: {
    sections: f.list({
      min: 1,
      max: 16,
      itemLabel: "title",
      fields: {
        title: f.text({ maxLength: 60 }),
        note: f.text({ optional: true, maxLength: 160, help: "e.g. 'Served until 11:30'" }),
        items: f.list({
          min: 1,
          max: 40,
          itemLabel: "name",
          fields: {
            name: f.text({ maxLength: 80 }),
            description: f.text({ optional: true, multiline: true, maxLength: 240 }),
            price: f.text({
              optional: true,
              maxLength: 24,
              help: "As printed, e.g. '12' or '9 / 14'",
            }),
            dietary: f.list({
              max: 6,
              itemLabel: "tag",
              fields: { tag: f.select({ options: DIET_OPTIONS }) },
            }),
          },
        }),
      },
      default: [
        {
          title: "Mornings",
          note: "Served until 11:30",
          items: [
            dish(
              "Overnight oats",
              "9",
              "Oats soaked in oat milk with stewed plums, toasted seeds and a little maple.",
              "vg",
            ),
            dish(
              "Sourdough toast",
              "7",
              "Naturally leavened, with cultured butter and wildflower honey.",
              "v",
            ),
            dish(
              "Turmeric scramble",
              "13",
              "Soft eggs, turmeric, greens from the market and chilli crisp on the side.",
              "gf",
              "spicy",
            ),
          ],
        },
        {
          title: "To drink",
          items: [
            dish("Oat flat white", "5", "A double shot of our house espresso.", "vg"),
            dish(
              "House chai",
              "5.50",
              "Brewed slowly with whole spices, black tea and your choice of milk.",
              "v",
            ),
            dish(
              "Ginger & lemon tonic",
              "4.50",
              "Fresh ginger, lemon and sparkling water.",
              "vg",
              "gf",
            ),
          ],
        },
      ],
    }),
    currency: f.text({
      optional: true,
      maxLength: 4,
      default: "$",
      help: "Shown before each price; leave empty to print prices as written",
    }),
    legend: f.boolean({ default: true, help: "Explain the dietary marks under the menu" }),
    footnote: f.text({
      optional: true,
      maxLength: 240,
      default: "Tell us about any allergies — most dishes can be adapted.",
    }),
  },
  variants: ["classic", "columns", "minimal"],
  styleSlots: ["colorTheme", "padding", "align", "animation", "typography.section"],
  ai: {
    purpose: "A restaurant, café or bar menu: sections of dishes with descriptions and prices.",
    whenToUse:
      "Menu pages and hospitality sites. Keep descriptions to one line; mark dietary information accurately. `columns` sets sections side by side on wide screens.",
    avoid:
      "Out-of-date prices; dietary claims the kitchen can't guarantee; using it for services (use the pricing table).",
  },
  render: ({ fields, variant, style }) => {
    const used = new Set<Diet>();
    for (const s of fields.sections)
      for (const item of s.items) for (const d of item.dietary) used.add(d.tag);
    const price = (p: string) =>
      fields.currency && /^\d/.test(p)
        ? p
            .split("/")
            .map((part) => `${fields.currency}${part.trim()}`)
            .join(" / ")
        : p;
    return (
      <div className={cx("os-menu-card", `os-menu-card--${variant}`)}>
        <div className="os-menu-card__sections">
          {fields.sections.map((section, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            <section key={i} className="os-menu-card__section">
              <h3 className={cx("os-menu-card__title", typo(style, "section", "h3"))}>
                {section.title}
              </h3>
              {section.note ? <p className="os-menu-card__note">{section.note}</p> : null}
              <ul className="os-menu-card__items">
                {section.items.map((item, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
                  <li key={j} className="os-menu-card__item">
                    <p className="os-menu-card__line">
                      <span className="os-menu-card__name">{item.name}</span>
                      {item.dietary.length ? (
                        <span className="os-menu-card__diet">
                          {item.dietary.map((d, k) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: a mark can repeat; position disambiguates
                            <abbr key={`${d.tag}-${k}`} title={DIETARY[d.tag].name}>
                              {DIETARY[d.tag].code}
                            </abbr>
                          ))}
                        </span>
                      ) : null}
                      <span className="os-menu-card__leader" aria-hidden="true" />
                      {item.price ? (
                        <span className="os-menu-card__price">{price(item.price)}</span>
                      ) : null}
                    </p>
                    {item.description ? (
                      <p className="os-menu-card__desc">{item.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {(fields.legend && used.size) || fields.footnote ? (
          <div className="os-menu-card__foot">
            {fields.legend && used.size ? (
              <ul className="os-menu-card__legend" aria-label="Dietary marks">
                {(Object.keys(DIETARY) as Diet[])
                  .filter((d) => used.has(d))
                  .map((d) => (
                    <li key={d}>
                      <b>{DIETARY[d].code}</b> {DIETARY[d].name}
                    </li>
                  ))}
              </ul>
            ) : null}
            {fields.footnote ? <p className="os-menu-card__footnote">{fields.footnote}</p> : null}
          </div>
        ) : null}
      </div>
    );
  },
});

export const restaurantMenuCss = `
.os-menu-card{display:grid;gap:var(--os-space-md)}
.os-menu-card__sections{display:grid;gap:var(--os-space-lg)}
@container block (min-width:52rem){.os-menu-card--columns .os-menu-card__sections{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--os-space-xl)}}
.os-menu-card__section{display:grid;gap:var(--os-space-xs);align-content:start}
.os-menu-card__title{margin:0;color:var(--os-color-heading)}
.os-menu-card__note{margin:-0.25em 0 0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted);font-style:italic}
.os-menu-card__items{display:grid;gap:var(--os-space-sm);margin:0;padding:0;list-style:none}
.os-menu-card__item{display:grid;gap:0.2em}
.os-menu-card__line{display:flex;align-items:baseline;gap:0.5em;margin:0}
.os-menu-card__name{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-menu-card__diet{display:inline-flex;gap:0.25em}
.os-menu-card__diet abbr{font-size:0.7em;font-weight:var(--os-font-weight-strong);letter-spacing:0.04em;text-decoration:none;color:var(--os-color-link);border:1px solid currentColor;border-radius:var(--os-radius-full);padding:0.05em 0.45em;cursor:help}
.os-menu-card__leader{flex:1;min-width:1rem;border-bottom:1.5px dotted var(--os-color-text-muted);translate:0 -0.3em}
.os-menu-card__price{font-variant-numeric:lining-nums tabular-nums;color:var(--os-color-heading);white-space:nowrap}
.os-menu-card__desc{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure);font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height)}
.os-menu-card--minimal .os-menu-card__leader{border:0}
.os-menu-card--minimal .os-menu-card__title{font-family:var(--os-type-eyebrow-font-family);font-size:var(--os-type-eyebrow-font-size);letter-spacing:var(--os-type-eyebrow-letter-spacing);text-transform:var(--os-type-eyebrow-text-transform);font-weight:var(--os-type-eyebrow-font-weight);color:var(--os-color-link);padding-bottom:var(--os-space-2xs);border-bottom:1px solid var(--os-color-border)}
.os-menu-card--classic .os-menu-card__title{text-align:center}
.os-menu-card--classic .os-menu-card__note{text-align:center}
.os-menu-card__foot{display:grid;gap:var(--os-space-2xs);padding-top:var(--os-space-sm);border-top:1px solid var(--os-color-border);font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-menu-card__legend{display:flex;flex-wrap:wrap;gap:0.4em 1.2em;margin:0;padding:0;list-style:none}
.os-menu-card__legend b{color:var(--os-color-heading)}
.os-menu-card__footnote{margin:0}
`;
