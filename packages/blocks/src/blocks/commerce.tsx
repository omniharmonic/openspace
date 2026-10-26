import {
  Button,
  cx,
  Img,
  itemPath,
  resolveImage,
  useCollectionQuery,
  useImageMap,
  useRenderContext,
} from "@openspace/renderer";
import { defineBlock, f, type Link as LinkValue } from "@openspace/schema";
import {
  currencyExponent,
  EditorNotice,
  formatMoney,
  headingLevelField,
  sub,
  typo,
  useHub,
  useLocale,
} from "../shared";
import { itemImage, PriceText, productPrice } from "./collections";
import { Honeypot, useSourcePath } from "./form";

/** Product + add to cart, and donations. */

/** A purchasable option: SKU, label, display price (minor units) and availability. */
export interface ProductOption {
  sku: string;
  label: string;
  price: number;
  available: boolean;
  /** The variant's own photo (media path or URL), shown when it's chosen. */
  image?: string;
}

export const productBlock = defineBlock({
  type: "product",
  version: 1,
  category: "commerce",
  label: "Product",
  icon: "shopping-bag",
  description: "One product from your shop with its price, options and an Add to cart button.",
  fields: {
    product: f.reference({
      collectionKinds: ["products"],
      maxItems: 1,
      default: { collection: "shop", items: ["cork-yoga-mat"] },
      help: "Pick one product from a products collection",
    }),
    showDescription: f.boolean({ default: true }),
    quantity: f.boolean({ default: true, label: "Quantity picker" }),
    buttonLabel: f.text({ maxLength: 30, default: "Add to cart" }),
    detailsLabel: f.text({ maxLength: 30, default: "View details" }),
  },
  variants: ["card", "split", "minimal"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "shadow",
    "align",
    "animation",
    "typography.title",
  ],
  ai: {
    purpose: "Sells one product from the shop: image, price, options and an Add to cart button.",
    whenToUse:
      "Featuring a single product on a landing page or inside a story. The price shown comes from the catalog; checkout always re-reads prices on the server.",
    avoid:
      "Products that don't exist in the shop collection; writing prices by hand in text blocks.",
  },
  render: ({ id, fields, variant, style }) => {
    const { basePath, doc } = useRenderContext();
    const imageMap = useImageMap();
    const locale = useLocale();
    const [item] = useCollectionQuery({ ...fields.product, limit: 1 });
    if (item?.kind !== "products")
      return (
        <EditorNotice>
          Choose a product from your shop. “{fields.product.items?.[0] ?? "—"}” wasn't found in “
          {fields.product.collection}”.
        </EditorNotice>
      );
    const fm = item.frontmatter;
    const currency = fm.price.currency;
    const price = productPrice(item, locale);
    const href = itemPath(fields.product.collection, item.slug, basePath);

    // Purchasable options: each variant with its own SKU, else the product's SKU.
    const options: ProductOption[] = (fm.variants ?? [])
      .filter((v) => v.sku)
      .map((v) => ({
        sku: v.sku as string,
        label: Object.values(v.options).join(" / "),
        price: v.price?.amount ?? fm.price.amount,
        available: v.available !== false && fm.available !== false,
        ...(v.image ? { image: v.image } : {}),
      }));
    if (!options.length && fm.sku)
      options.push({
        sku: fm.sku,
        label: fm.title,
        price: fm.price.amount,
        available: fm.available !== false,
      });
    const firstAvailable = options.find((o) => o.available);
    // The chosen variant's photo leads; otherwise the product's own.
    const base = itemImage(item);
    const baseSrc = typeof base === "string" ? base : base?.src;
    const image = firstAvailable?.image ?? base ?? options.find((o) => o.image)?.image;
    const swaps = options.length > 1 && options.some((o) => o.image);
    const imageClass = swaps ? sub(id, "photo") : undefined;
    const photoUrl = (src: string | undefined) =>
      src ? resolveImage(src, { imageMap, doc, basePath }).src : undefined;
    const pickId = sub(id, "option");
    const qtyId = sub(id, "qty");
    const notCloudflare = doc && doc.config.deploy.target !== "cloudflare";

    return (
      <article className={cx("os-product", `os-product--${variant}`)}>
        {image && variant !== "minimal" ? (
          <Img
            src={image}
            aspect="4:5"
            sizes={
              variant === "split"
                ? "(min-width: 768px) 50vw, 100vw"
                : "(min-width: 768px) 40vw, 100vw"
            }
            className={cx("os-product__image", imageClass)}
          />
        ) : null}
        <div className="os-product__body">
          <h3
            className={cx(
              "os-product__title",
              typo(style, "title", variant === "split" ? "h2" : "h3"),
            )}
          >
            <a className="os-product__link" href={href}>
              {fm.title}
            </a>
          </h3>
          {price ? (
            <p className="os-product__price">
              <PriceText price={price} />
            </p>
          ) : null}
          {fields.showDescription && fm.excerpt ? (
            <p className="os-product__desc">{fm.excerpt}</p>
          ) : null}
          {firstAvailable ? (
            <div className="os-product__buy">
              {options.length > 1 ? (
                <div className="os-field os-product__option">
                  <label className="os-label" htmlFor={pickId}>
                    {fm.options?.map((o) => o.name).join(" / ") || "Option"}
                  </label>
                  <select className="os-select" id={pickId} defaultValue={firstAvailable.sku}>
                    {options.map((o) => (
                      <option
                        key={o.sku}
                        value={o.sku}
                        disabled={!o.available || undefined}
                        data-os-name={`${fm.title} — ${o.label}`}
                        data-os-price={o.price}
                        data-os-image={swaps ? photoUrl(o.image ?? baseSrc) : undefined}
                      >
                        {o.label}
                        {o.price !== fm.price.amount
                          ? ` — ${formatMoney(o.price, currency, locale)}`
                          : ""}
                        {o.available ? "" : " (sold out)"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="os-product__row">
                {fields.quantity ? (
                  <div className="os-field os-product__qty">
                    <label className="os-label" htmlFor={qtyId}>
                      Quantity
                    </label>
                    <input
                      className="os-input"
                      id={qtyId}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="99"
                      defaultValue="1"
                    />
                  </div>
                ) : null}
                <Button
                  className="os-product__add"
                  attrs={{
                    "data-os-behavior": "cart",
                    "data-os-add": "",
                    "data-os-sku": firstAvailable.sku,
                    "data-os-name":
                      options.length > 1 ? `${fm.title} — ${firstAvailable.label}` : fm.title,
                    "data-os-price": String(firstAvailable.price),
                    "data-os-currency": currency,
                    "data-os-qty-input": fields.quantity ? `#${qtyId}` : undefined,
                    "data-os-sku-input": options.length > 1 ? `#${pickId}` : undefined,
                    "data-os-image-target": imageClass ? `.${imageClass}` : undefined,
                  }}
                >
                  {fields.buttonLabel}
                </Button>
              </div>
            </div>
          ) : options.length ? (
            <p className="os-product__soldout">Sold out</p>
          ) : (
            <EditorNotice>Give this product a SKU so it can be added to the cart.</EditorNotice>
          )}
          <a className="os-product__details" href={href}>
            {fields.detailsLabel}
            <span className="os-visually-hidden">: {fm.title}</span>
          </a>
          {notCloudflare ? (
            <EditorNotice>
              Checkout needs the Cloudflare hosting option and a connected Stripe account.
            </EditorNotice>
          ) : null}
        </div>
      </article>
    );
  },
});

// --- donation -------------------------------------------------------------------------------------

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "JPY",
] as const;

export const donationBlock = defineBlock({
  type: "donation",
  version: 1,
  category: "commerce",
  label: "Donation",
  icon: "hand-heart",
  description:
    "Preset or custom amounts, one-time or monthly, paid through Stripe or your own link.",
  fields: {
    heading: f.text({ optional: true, maxLength: 80, default: "Keep community classes free" }),
    headingLevel: headingLevelField(),
    description: f.text({
      optional: true,
      multiline: true,
      maxLength: 400,
      default:
        "Every Sunday we teach a free class for anyone who can't afford one. Your gift pays for a teacher, mats and the room — thank you.",
    }),
    mode: f.select({
      options: [
        { value: "checkout", label: "Stripe checkout (through your Hub)" },
        { value: "link", label: "Link to another donation page" },
      ],
      default: "checkout",
    }),
    currency: f.select({
      options: CURRENCIES.map((c) => ({ value: c, label: c })),
      default: "USD",
    }),
    amounts: f.list({
      min: 1,
      max: 6,
      itemLabel: "amount",
      fields: { amount: f.number({ min: 1, max: 100000, help: "In whole units, e.g. 25" }) },
      default: [{ amount: 15 }, { amount: 35 }, { amount: 75 }, { amount: 150 }],
    }),
    allowCustom: f.boolean({ default: true, label: "Allow another amount" }),
    frequency: f.select({
      options: [
        { value: "both", label: "One-time and monthly" },
        { value: "once", label: "One-time only" },
        { value: "monthly", label: "Monthly only" },
      ],
      default: "both",
    }),
    buttonLabel: f.text({ maxLength: 30, default: "Donate" }),
    link: f.link({ optional: true, allow: ["url"], help: "For 'Link' mode: your donation page" }),
    note: f.text({
      optional: true,
      maxLength: 200,
      default: "Payments are handled securely by Stripe. You'll get a receipt by email.",
    }),
  },
  variants: ["card", "inline", "split"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "shadow",
    "align",
    "animation",
    "typography.heading",
  ],
  ai: {
    purpose: "Collects donations: preset or custom amounts, one-time or monthly.",
    whenToUse:
      "Non-profits, community projects and creators. Say concretely what a gift pays for. `link` mode points to an existing donation page (Open Collective, Stripe Payment Link…).",
    avoid:
      "Amounts or causes the owner hasn't approved; promising tax deductibility without confirming it.",
  },
  render: ({ id, fields, variant, style }) => {
    const HTag = fields.headingLevel;
    const { hub, siteId } = useHub();
    const source = useSourcePath();
    const locale = useLocale();
    const exp = currencyExponent(fields.currency);
    const intro =
      fields.heading || fields.description ? (
        <div className="os-donation__intro">
          {fields.heading ? (
            <HTag className={cx("os-donation__heading", typo(style, "heading", "h3"))}>
              {fields.heading}
            </HTag>
          ) : null}
          {fields.description ? <p className="os-donation__text">{fields.description}</p> : null}
        </div>
      ) : null;
    const note = fields.note ? <p className="os-donation__note">{fields.note}</p> : null;

    if (fields.mode === "link") {
      return (
        <div className={cx("os-donation", `os-donation--${variant}`)}>
          {intro}
          {fields.link ? (
            <div>
              <Button to={fields.link as LinkValue}>{fields.buttonLabel}</Button>
            </div>
          ) : (
            <EditorNotice>Add the link to your donation page.</EditorNotice>
          )}
          {note}
        </div>
      );
    }

    const amountName = "amount";
    const intervals =
      fields.frequency === "both"
        ? (["once", "month"] as const)
        : fields.frequency === "monthly"
          ? (["month"] as const)
          : (["once"] as const);
    return (
      <div className={cx("os-donation", `os-donation--${variant}`)}>
        {intro}
        <form
          className="os-donation__form"
          method="post"
          action={`${hub}/c/${siteId}/checkout`}
          acceptCharset="utf-8"
        >
          <input type="hidden" name="kind" value="donation" />
          <input type="hidden" name="currency" value={fields.currency} />
          <input type="hidden" name="_source" value={source} />
          {intervals.length > 1 ? (
            <fieldset className="os-donation__group os-donation__freq">
              <legend className="os-visually-hidden">How often</legend>
              {intervals.map((iv, i) => (
                <label key={iv} className="os-donation__pill">
                  <input type="radio" name="interval" value={iv} defaultChecked={i === 0} />
                  <span>{iv === "once" ? "One-time" : "Monthly"}</span>
                </label>
              ))}
            </fieldset>
          ) : (
            <input type="hidden" name="interval" value={intervals[0]} />
          )}
          <fieldset className="os-donation__group os-donation__amounts">
            <legend className="os-label">Amount</legend>
            {fields.amounts.map((a, i) => {
              const minor = Math.round(a.amount * 10 ** exp);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: amounts are positional
                <label key={i} className="os-donation__pill">
                  <input type="radio" name={amountName} value={minor} defaultChecked={i === 0} />
                  <span>{formatMoney(minor, fields.currency, locale)}</span>
                </label>
              );
            })}
          </fieldset>
          {fields.allowCustom ? (
            <div className="os-field os-donation__custom">
              <label className="os-label" htmlFor={sub(id, "custom")}>
                Or give another amount ({fields.currency})
              </label>
              <input
                className="os-input"
                id={sub(id, "custom")}
                name="custom_amount"
                type="number"
                inputMode="decimal"
                min="1"
                step={exp === 0 ? "1" : "0.01"}
                aria-describedby={sub(id, "custom-help")}
              />
              <p className="os-field__help" id={sub(id, "custom-help")}>
                Replaces the amount chosen above. Leave empty to give that amount.
              </p>
            </div>
          ) : null}
          <Honeypot />
          <Button type="submit" className="os-donation__submit">
            {fields.buttonLabel}
          </Button>
          {note}
        </form>
      </div>
    );
  },
});

export const commerceCss = `
.os-product{display:grid;gap:var(--os-space-sm);align-content:start}
.os-product--minimal{max-inline-size:34rem}
.os-product__body{display:grid;gap:var(--os-space-xs);align-content:start;min-width:0}
.os-product__title{margin:0;color:var(--os-color-heading)}
.os-product__link{color:inherit;text-decoration:none}
.os-product__link:hover{text-decoration:underline;text-underline-offset:0.2em}
.os-product__price{display:flex;flex-wrap:wrap;gap:0 0.3em;align-items:baseline;margin:0;font-size:var(--os-type-lead-font-size);font-weight:var(--os-font-weight-strong);color:var(--os-color-heading);font-variant-numeric:lining-nums}
.os-product__price s{font-weight:400;color:var(--os-color-text-muted)}
.os-product__desc{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
.os-product__buy{display:grid;gap:var(--os-space-xs);margin-top:var(--os-space-2xs)}
.os-product__row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:var(--os-space-xs)}
.os-product__qty{width:6rem}
.os-product__add{flex:1 1 12rem;justify-content:center}
html:not(.os-js) .os-product__buy{display:none}
.os-product__soldout{margin:0;font-weight:var(--os-font-weight-strong);color:var(--os-color-text-muted)}
.os-product__details{justify-self:start;font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);color:var(--os-color-link)}
.os-product--card{max-inline-size:26rem;padding:var(--os-space-sm);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-block.has-radius .os-product--card{border-radius:var(--radius)}
.os-block.os-themed .os-product--card{background:transparent;padding:0}
@container block (min-width:48rem){.os-product--split{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--os-space-lg);align-items:center}}

.os-donation{display:grid;gap:var(--os-space-sm)}
.os-donation__intro{display:grid;gap:var(--os-space-2xs)}
.os-donation__heading{margin:0;color:var(--os-color-heading)}
.os-donation__text{margin:0;color:var(--os-color-text);max-inline-size:var(--os-measure)}
.os-donation__form{display:grid;gap:var(--os-space-sm)}
.os-donation__group{display:flex;flex-wrap:wrap;gap:var(--os-space-2xs);margin:0;padding:0;border:0;min-inline-size:0}
.os-donation__group>legend.os-label{width:100%;margin-bottom:var(--os-space-3xs)}
.os-donation__pill{position:relative;display:inline-flex}
.os-donation__pill>input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.os-donation__pill>span{display:inline-grid;place-items:center;min-width:5rem;min-height:2.75rem;padding:0.5em 1em;border:1.5px solid var(--os-color-text-muted);border-radius:var(--os-radius-button);color:var(--os-color-heading);font-weight:var(--os-font-weight-strong);font-variant-numeric:lining-nums;transition:background-color var(--os-motion-duration-fast) var(--os-motion-ease),border-color var(--os-motion-duration-fast) var(--os-motion-ease)}
.os-donation__pill:hover>span{border-color:var(--os-color-heading)}
.os-donation__pill>input:checked+span{background:var(--os-color-accent);border-color:var(--os-color-accent);color:var(--os-color-accent-text)}
.os-donation__pill>input:focus-visible+span{outline:2px solid var(--os-color-focus);outline-offset:2px}
.os-donation__freq{padding:0.25rem;background:var(--os-color-surface);border-radius:var(--os-radius-full);justify-self:start}
.os-donation__freq .os-donation__pill>span{border:0;border-radius:var(--os-radius-full);min-height:2.25rem;min-width:6rem}
.os-donation__custom{max-inline-size:14rem}
.os-donation__submit{justify-self:start;min-width:10rem;justify-content:center}
.os-donation__note{margin:0;font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-donation--card{padding:var(--os-space-md);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-donation--card .os-donation__freq{background:var(--os-color-background)}
.os-block.has-radius .os-donation--card{border-radius:var(--radius)}
.os-block.os-themed .os-donation--card{background:transparent;padding:0}
@container block (min-width:52rem){.os-donation--split{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--os-space-lg);align-items:start}}
`;
