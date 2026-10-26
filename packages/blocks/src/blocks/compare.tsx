import { cx, Img } from "@openspace/renderer";
import { defineBlock, f, type ImageValue } from "@openspace/schema";
import { aspectField, sub } from "../shared";

const photo = (id: string, alt: string, width: number, height: number): ImageValue => ({
  src: `https://images.unsplash.com/photo-${id}?w=2400&q=80`,
  alt,
  width,
  height,
});

export const beforeAfterBlock = defineBlock({
  type: "before-after",
  version: 1,
  category: "media",
  label: "Before / after",
  icon: "square-split-horizontal",
  description: "Two images in one frame with a slider that wipes between them.",
  fields: {
    before: f.image({
      default: photo(
        "1493809842364-78817add7ffb",
        "A light lounge with a blue sofa, herringbone floor and white cabinets",
        2400,
        1602,
      ),
    }),
    after: f.image({
      default: photo(
        "1505691938895-1758d7feb511",
        "A lounge with a cream sofa, patterned cushions, lamps and a floral painting",
        2400,
        1600,
      ),
    }),
    beforeLabel: f.text({ maxLength: 30, default: "Light & airy" }),
    afterLabel: f.text({ maxLength: 30, default: "Warm & layered" }),
    start: f.number({
      min: 0,
      max: 100,
      integer: true,
      default: 50,
      unit: "%",
      help: "Where the divider starts",
    }),
    aspect: aspectField("3:2", "Both images are cropped to this shape"),
    caption: f.text({
      optional: true,
      maxLength: 200,
      default: "Drag to compare two lounge schemes from our styling guide.",
    }),
  },
  variants: ["labels", "minimal"],
  styleSlots: ["radius", "shadow", "padding", "animation"],
  ai: {
    purpose:
      "Compares two matching images with a draggable divider: renovations, retouching, seasons.",
    whenToUse:
      "When the difference between two shots of the same view is the point. Use images with identical framing and size.",
    avoid: "Unrelated images; misleading edits; more than one or two per page.",
  },
  render: ({ id, fields, variant }) => {
    const aspect = fields.aspect === "original" ? "3:2" : fields.aspect;
    const sizes = "(min-width: 1200px) 60vw, 100vw";
    const rangeId = sub(id, "range");
    return (
      <figure
        className={cx("os-compare", `os-compare--${variant}`)}
        data-os-behavior="before-after"
        data-os-before={fields.beforeLabel}
        data-os-after={fields.afterLabel}
        style={{ "--pos": `${fields.start}%` }}
      >
        <div className="os-compare__stage">
          <div className="os-compare__after">
            <Img src={fields.after} aspect={aspect} sizes={sizes} treatment="none" />
            <span className="os-compare__tag os-compare__tag--after">{fields.afterLabel}</span>
          </div>
          <div className="os-compare__before">
            <Img src={fields.before} aspect={aspect} sizes={sizes} treatment="none" />
            <span className="os-compare__tag os-compare__tag--before">{fields.beforeLabel}</span>
          </div>
          <label className="os-visually-hidden" htmlFor={rangeId}>
            Compare {fields.beforeLabel} and {fields.afterLabel}
          </label>
          <input
            id={rangeId}
            className="os-compare__range"
            type="range"
            min="0"
            max="100"
            step="1"
            defaultValue={fields.start}
          />
          <span className="os-compare__handle" aria-hidden="true" />
        </div>
        {fields.caption ? (
          <figcaption className="os-compare__caption">{fields.caption}</figcaption>
        ) : null}
      </figure>
    );
  },
});

export const compareCss = `
.os-compare{display:grid;gap:var(--os-space-2xs);margin:0}
.os-block.has-radius .os-compare__stage{border-radius:var(--radius)}
.os-compare__stage .os-img{border-radius:0}
.os-compare__after,.os-compare__before{position:relative}
.os-compare__tag{position:absolute;top:var(--os-space-xs);z-index:1;padding:0.25em 0.75em;border-radius:var(--os-radius-full);background:color-mix(in oklab,var(--os-color-neutral-950) 62%,transparent);color:var(--os-color-neutral-50);font-size:var(--os-type-small-font-size);font-weight:var(--os-font-weight-strong);pointer-events:none}
.os-compare__tag--before{inset-inline-start:var(--os-space-xs)}
.os-compare__tag--after{inset-inline-end:var(--os-space-xs)}
.os-compare--minimal .os-compare__tag{display:none}
html:not(.os-js) .os-compare--minimal .os-compare__tag{display:block}
.os-compare__handle::before{content:"";position:absolute;top:50%;left:50%;z-index:1;width:0.9rem;height:0.9rem;translate:-50% -50%;background:linear-gradient(90deg,var(--os-color-neutral-700) 0 2px,transparent 2px calc(100% - 2px),var(--os-color-neutral-700) calc(100% - 2px))}
.os-compare__caption{font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
`;
