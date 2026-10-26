import { cx, Img, Link, RichText } from "@openspace/renderer";
import {
  type AspectRatio,
  defineBlock,
  f,
  type Link as LinkValue,
  type RichTextDoc,
} from "@openspace/schema";
import { ICON_OPTIONS, Icon, type IconName } from "../icons";
import { aspectField, DEMO, rt, typo } from "../shared";

const BODY = { marks: ["bold", "italic", "link"], blocks: ["paragraph", "bulletList"] } as const;

/** Card, icon list and columns: repeatable content units. */

export const cardBlock = defineBlock({
  type: "card",
  version: 1,
  category: "layout",
  label: "Card",
  icon: "square-chart-gantt",
  description: "An image, heading, short text and link as one clickable unit.",
  fields: {
    image: f.image({ optional: true, default: DEMO.coffeeTable }),
    aspect: aspectField("4:5"),
    icon: f.select({ options: ICON_OPTIONS, optional: true, help: "Shown when there's no image" }),
    eyebrow: f.text({ optional: true, maxLength: 40, default: "Workshop · 3 hours" }),
    heading: f.text({ maxLength: 90, default: "Slow Sunday: restorative yoga & tea" }),
    body: f.richText({
      ...BODY,
      maxLength: 400,
      default: rt.doc(
        rt.p(
          "Long holds, warm blankets and a pot of hojicha afterwards. A gentle reset for the week ahead.",
        ),
      ),
    }),
    link: f.link({ optional: true, default: { type: "url", url: "/workshops" } }),
    linkLabel: f.text({ optional: true, maxLength: 30, default: "Reserve a spot" }),
  },
  variants: ["stacked", "horizontal", "overlay", "minimal"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "border",
    "shadow",
    "align",
    "imageTreatment",
    "animation",
    "typography.heading",
  ],
  ai: {
    purpose:
      "One self-contained item — a service, offer, event or article teaser — with an optional link.",
    whenToUse:
      "Place 2–4 cards side by side in stack columns for services or offers. `overlay` sets text on the photo; `horizontal` suits wide columns.",
    avoid: "Long body text (keep under ~40 words); different aspect ratios across cards in a row.",
  },
  render: ({ fields, variant, style }) => {
    const link = fields.link as LinkValue | undefined;
    const media = fields.image ? (
      <Img
        src={fields.image}
        sizes="(min-width: 1200px) 33vw, (min-width: 768px) 50vw, 100vw"
        aspect={
          (variant === "overlay" && fields.aspect === "original"
            ? "4:5"
            : fields.aspect) as AspectRatio
        }
        className="os-card__media"
      />
    ) : fields.icon ? (
      <span className="os-card__icon">
        <Icon name={fields.icon as IconName} size={28} />
      </span>
    ) : null;
    return (
      <article
        className={cx(
          "os-cardblock",
          `os-cardblock--${variant}`,
          link && "is-linked",
          fields.image ? "has-image" : "no-image",
        )}
      >
        {media}
        <div className="os-cardblock__body">
          {fields.eyebrow ? (
            <p className="os-cardblock__eyebrow os-type-eyebrow">{fields.eyebrow}</p>
          ) : null}
          <h3 className={cx("os-cardblock__title", typo(style, "heading", "h4"))}>
            {link ? (
              <Link to={link} className="os-cardblock__link">
                {fields.heading}
              </Link>
            ) : (
              fields.heading
            )}
          </h3>
          <RichText doc={fields.body as RichTextDoc} className="os-cardblock__text" />
          {link && fields.linkLabel ? (
            <span className="os-cardblock__more" aria-hidden="true">
              {fields.linkLabel}
              <Icon name="arrow-right" size={16} />
            </span>
          ) : null}
        </div>
      </article>
    );
  },
});

// --- icon list ----------------------------------------------------------------------------------

export const iconListBlock = defineBlock({
  type: "icon-list",
  version: 1,
  category: "text",
  label: "Icon list",
  icon: "list-checks",
  description: "Features, amenities or benefits, each with an icon.",
  fields: {
    items: f.list({
      min: 1,
      max: 24,
      itemLabel: "title",
      fields: {
        icon: f.select({ options: ICON_OPTIONS, default: "check" }),
        title: f.text({ maxLength: 60 }),
        text: f.text({ optional: true, multiline: true, maxLength: 200 }),
      },
      default: [
        {
          icon: "users",
          title: "Twelve mats, never more",
          text: "Small classes mean real feedback and a teacher who knows your name.",
        },
        {
          icon: "leaf",
          title: "Everything provided",
          text: "Mats, blocks, bolsters and blankets — just bring yourself.",
        },
        {
          icon: "coffee",
          title: "Tea after class",
          text: "Stay a while. The kettle is always on.",
        },
        {
          icon: "accessibility",
          title: "Step-free studio",
          text: "Level entrance, accessible changing room and chairs for every class.",
        },
      ],
    }),
    columns: f.select({
      options: [
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
      default: "2",
      display: "segmented",
      help: "Columns on wide screens",
    }),
  },
  variants: ["list", "tiles", "checklist"],
  styleSlots: ["colorTheme", "padding", "radius", "border", "align", "animation"],
  ai: {
    purpose: "A scannable list of features, amenities, benefits or what's included.",
    whenToUse: "Services and pricing pages, 'what to expect' sections. 3–8 items.",
    avoid: "Using icons that don't match the meaning; paragraphs instead of one-line points.",
  },
  render: ({ fields, variant }) => (
    <ul
      className={cx("os-iconlist", `os-iconlist--${variant}`)}
      style={{ "--il-cols": fields.columns, "--il-tcols": Math.min(Number(fields.columns), 2) }}
    >
      {fields.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
        <li key={i} className="os-iconlist__item">
          <span className="os-iconlist__icon">
            <Icon name={item.icon as IconName} size={variant === "checklist" ? 20 : 24} />
          </span>
          <span className="os-iconlist__body">
            <span className="os-iconlist__title">{item.title}</span>
            {item.text && variant !== "checklist" ? (
              <span className="os-iconlist__text">{item.text}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  ),
});

// --- columns --------------------------------------------------------------------------------------

export const columnsBlock = defineBlock({
  type: "columns",
  version: 1,
  category: "layout",
  label: "Columns",
  icon: "columns-3",
  description: "Two to four side-by-side columns of short content: features, steps or offers.",
  fields: {
    items: f.list({
      min: 1,
      max: 8,
      itemLabel: "heading",
      fields: {
        image: f.image({ optional: true }),
        heading: f.text({ maxLength: 80 }),
        body: f.richText({ ...BODY, maxLength: 400 }),
        link: f.link({ optional: true }),
        linkLabel: f.text({ optional: true, maxLength: 30 }),
      },
      default: [
        {
          heading: "Book",
          body: rt.doc(
            rt.p("Pick a class on the schedule and reserve your mat online — it takes a minute."),
          ),
        },
        {
          heading: "Arrive",
          body: rt.doc(
            rt.p(
              "Come ten minutes early. We'll show you around, set up your mat and answer questions.",
            ),
          ),
        },
        {
          heading: "Breathe",
          body: rt.doc(
            rt.p(
              "Move at your own pace. Afterwards, stay for tea and meet the people on the mats beside you.",
            ),
          ),
          link: { type: "url", url: "/schedule" },
          linkLabel: "See the schedule",
        },
      ],
    }),
    columns: f.select({
      options: [
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
      ],
      default: "3",
      display: "segmented",
    }),
    aspect: aspectField("3:2"),
  },
  variants: ["plain", "cards", "steps"],
  styleSlots: [
    "colorTheme",
    "padding",
    "radius",
    "border",
    "align",
    "imageTreatment",
    "animation",
    "typography.heading",
  ],
  ai: {
    purpose: "Parallel content in columns: a feature trio, numbered steps, or short offers.",
    whenToUse:
      "When 2–4 items share the same shape. `steps` numbers them for a process; `cards` puts each on a surface.",
    avoid: "Uneven text lengths across columns; more than four columns; long paragraphs.",
  },
  render: ({ fields, variant, style }) => (
    <ol
      className={cx("os-columns", `os-columns--${variant}`)}
      style={{ "--c-cols": fields.columns, "--c-tcols": Math.min(Number(fields.columns), 2) }}
    >
      {fields.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
        <li key={i} className="os-columns__item">
          {item.image ? (
            <Img
              src={item.image}
              sizes="(min-width: 1200px) 30vw, (min-width: 768px) 45vw, 100vw"
              aspect={fields.aspect as AspectRatio}
              className="os-columns__media"
            />
          ) : null}
          {variant === "steps" ? (
            <span className="os-columns__num" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
          ) : null}
          <h3 className={cx("os-columns__title", typo(style, "heading", "h4"))}>{item.heading}</h3>
          <RichText doc={item.body as RichTextDoc} className="os-columns__text" />
          {item.link && item.linkLabel ? (
            <Link to={item.link as LinkValue} className="os-columns__link">
              {item.linkLabel}
              <Icon name="arrow-right" size={16} />
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  ),
});

export const cardCss = `
.os-cardblock{position:relative;display:grid;align-content:start;gap:var(--os-space-xs);height:100%;isolation:isolate}
.os-cardblock__body{display:grid;align-content:start;gap:var(--os-space-2xs)}
.os-cardblock__eyebrow{color:var(--os-color-text-muted)}
.os-cardblock__title{margin:0}
.os-cardblock__link{color:inherit;text-decoration:none}
.os-cardblock__link::after{content:"";position:absolute;inset:0;z-index:1}
.os-cardblock__link:focus-visible{outline:none}
.os-cardblock.is-linked:has(.os-cardblock__link:focus-visible){outline:2px solid var(--os-color-focus);outline-offset:4px}
.os-cardblock__text .os-rich>*{max-inline-size:none}
.os-cardblock__text,.os-cardblock__text .os-rich{color:var(--os-color-text)}
.os-cardblock__more{display:inline-flex;align-items:center;gap:0.35em;margin-top:var(--os-space-3xs);font-weight:var(--os-font-weight-strong);color:var(--os-color-link)}
.os-cardblock__more .os-icon{transition:translate var(--os-motion-duration-base) var(--os-motion-ease)}
.os-cardblock.is-linked:hover .os-cardblock__more .os-icon{translate:0.25em 0}
.os-cardblock.is-linked:hover .os-cardblock__title{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:0.2em}
.os-card__icon,.os-iconlist__icon{display:inline-grid;place-items:center;flex:none;color:var(--os-color-accent)}
.os-card__icon{width:3.25rem;height:3.25rem;border-radius:var(--os-radius-full);background:var(--os-color-surface)}
.os-cardblock--stacked,.os-cardblock--horizontal{padding:var(--os-space-xs);background:var(--os-color-surface-raised);border-radius:var(--os-radius-card);box-shadow:var(--os-shadow-sm);transition:box-shadow var(--os-motion-duration-base) var(--os-motion-ease),translate var(--os-motion-duration-base) var(--os-motion-ease)}
.os-cardblock--stacked .os-cardblock__body,.os-cardblock--horizontal .os-cardblock__body{padding:var(--os-space-2xs) var(--os-space-2xs) var(--os-space-xs)}
.os-cardblock--stacked.is-linked:hover,.os-cardblock--horizontal.is-linked:hover{box-shadow:var(--os-shadow-md);translate:0 -2px}
.os-cardblock--stacked.no-image .os-cardblock__body{padding-top:0}
.os-block.has-radius .os-cardblock{border-radius:var(--radius)}
.os-block.os-themed .os-cardblock--stacked,.os-block.os-themed .os-cardblock--horizontal{background:transparent;box-shadow:none;padding:0}
@container block (min-width:36rem){.os-cardblock--horizontal.has-image{grid-template-columns:minmax(0,2fr) minmax(0,3fr);align-items:center;gap:var(--os-space-sm)}}
.os-cardblock--overlay{color:var(--os-color-neutral-50);overflow:hidden;border-radius:var(--os-image-radius)}
.os-cardblock--overlay.has-image>.os-card__media{grid-area:1/1}
.os-cardblock--overlay.has-image>.os-cardblock__body{grid-area:1/1;align-self:end;z-index:2;padding:var(--os-space-xl) var(--os-space-sm) var(--os-space-sm);background:linear-gradient(to top,color-mix(in oklab,var(--os-color-neutral-950) 72%,transparent),transparent);border-radius:0 0 var(--os-image-radius) var(--os-image-radius)}
.os-cardblock--overlay.has-image :is(.os-cardblock__title,.os-cardblock__eyebrow,.os-cardblock__text,.os-cardblock__text .os-rich,.os-cardblock__more){color:var(--os-color-neutral-50)}
.os-cardblock--overlay.no-image{padding:var(--os-space-md);background:var(--os-color-accent);color:var(--os-color-accent-text)}
.os-cardblock--overlay.no-image :is(.os-cardblock__title,.os-cardblock__eyebrow,.os-cardblock__text,.os-cardblock__text .os-rich,.os-cardblock__more,.os-card__icon){color:var(--os-color-accent-text)}
.os-cardblock--minimal{gap:var(--os-space-xs)}
.os-cardblock--minimal .os-cardblock__body{padding-top:var(--os-space-3xs)}

.os-iconlist{display:grid;gap:var(--os-space-sm) var(--os-space-md);margin:0}
@container block (min-width:36rem){.os-iconlist{grid-template-columns:repeat(var(--il-tcols,2),minmax(0,1fr))}}
@container block (min-width:60rem){.os-iconlist{grid-template-columns:repeat(var(--il-cols,2),minmax(0,1fr))}}
.os-iconlist__item{display:flex;gap:var(--os-space-xs);align-items:flex-start}
.os-iconlist__icon{width:2.75rem;height:2.75rem;border-radius:var(--os-radius-full);background:var(--os-color-surface)}
.os-iconlist__body{display:grid;gap:0.2em;padding-top:0.35rem}
.os-iconlist__title{font-weight:var(--os-font-weight-strong);color:var(--os-color-heading)}
.os-iconlist__text{color:var(--os-color-text-muted);font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height)}
.os-iconlist--tiles{gap:var(--os-space-xs)}
.os-iconlist--tiles .os-iconlist__item{flex-direction:column;gap:var(--os-space-xs);padding:var(--os-space-sm);border-radius:var(--os-radius-card);background:var(--os-color-surface)}
.os-iconlist--tiles .os-iconlist__icon{background:var(--os-color-background)}
.os-iconlist--tiles .os-iconlist__body{padding-top:0}
.os-iconlist--checklist{gap:var(--os-space-2xs) var(--os-space-md)}
.os-iconlist--checklist .os-iconlist__item{align-items:center;gap:var(--os-space-2xs)}
.os-iconlist--checklist .os-iconlist__icon{width:auto;height:auto;background:none}
.os-iconlist--checklist .os-iconlist__body{padding:0}
.os-iconlist--checklist .os-iconlist__title{font-weight:var(--os-font-weight-body);color:var(--os-color-text)}

.os-columns{display:grid;gap:var(--os-space-md);margin:0;counter-reset:none}
@container block (min-width:36rem){.os-columns{grid-template-columns:repeat(var(--c-tcols,2),minmax(0,1fr))}}
@container block (min-width:60rem){.os-columns{grid-template-columns:repeat(var(--c-cols,3),minmax(0,1fr));gap:var(--os-space-lg)}}
.os-columns__item{display:grid;align-content:start;gap:var(--os-space-2xs)}
.os-columns__media{margin-bottom:var(--os-space-2xs)}
.os-columns__title{margin:0}
.os-columns__text .os-rich>*{max-inline-size:none}
.os-columns__link{display:inline-flex;align-items:center;gap:0.35em;justify-self:start;font-weight:var(--os-font-weight-strong)}
.os-columns--cards{gap:var(--os-space-sm)}
.os-columns--cards .os-columns__item{padding:var(--os-space-sm);border-radius:var(--os-radius-card);background:var(--os-color-surface-raised);box-shadow:var(--os-shadow-sm)}
.os-block.has-radius .os-columns--cards .os-columns__item{border-radius:var(--radius)}
.os-columns--steps .os-columns__item{padding-top:var(--os-space-sm);border-top:1px solid var(--os-color-text-muted)}
.os-columns__num{font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:var(--os-type-h2-font-size);line-height:1;color:var(--os-color-accent);font-variant-numeric:tabular-nums}
`;
