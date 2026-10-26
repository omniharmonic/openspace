import { cx, Img, Link, SectionContext } from "@openspace/renderer";
import { type AspectRatio, defineBlock, f } from "@openspace/schema";
import { useContext } from "react";
import { aspectField, DEMO, useImageUrl } from "../shared";

export const imageBlock = defineBlock({
  type: "image",
  version: 1,
  category: "media",
  label: "Image",
  icon: "image",
  description: "A responsive photograph with optional caption, link or lightbox.",
  fields: {
    image: f.image({
      ai: "Alt text describes what the image is for, e.g. 'Morning class stretching by the window'. Use alt '' only for purely decorative images.",
      default: DEMO.pilates,
    }),
    aspect: aspectField("4:5"),
    caption: f.text({ optional: true, maxLength: 200, ai: "Optional; one short sentence." }),
    link: f.link({ optional: true, help: "Make the whole image a link" }),
    lightbox: f.boolean({ default: false, help: "Open a larger view when clicked" }),
  },
  variants: ["default", "caption-overlay", "inset"],
  styleSlots: ["radius", "shadow", "imageTreatment", "align", "padding", "animation"],
  defaults: {
    fields: { caption: "Saturday Foundations, in the east room." },
  },
  ai: {
    purpose: "A single photograph or illustration.",
    whenToUse:
      "To show the place, the people, the work or the product. Keep aspect ratios consistent within a section. `caption-overlay` suits atmospheric shots; `inset` frames an image on a soft surface.",
    avoid: "Stock photos that don't depict the business; text baked into images; missing alt text.",
  },
  render: ({ fields, variant }) => <ImageView fields={fields} variant={variant} />,
});

type ImageFields = Parameters<typeof imageBlock.render>[0]["fields"];

function ImageView({ fields, variant }: { fields: ImageFields; variant: string }) {
  const grid = useContext(SectionContext)?.layout.mode === "grid";
  const fullUrl = useImageUrl();
  const sizes = grid ? "(min-width: 1200px) 60vw, 100vw" : "(min-width: 1200px) 50vw, 100vw";
  const img = grid ? (
    <Img src={fields.image} sizes={sizes} fill />
  ) : (
    <Img src={fields.image} sizes={sizes} aspect={fields.aspect as AspectRatio} />
  );
  const label = fields.image.alt || fields.caption || "View image";
  let media = img;
  if (fields.link) {
    media = (
      <Link
        to={fields.link}
        className="os-image__link"
        aria-label={fields.image.alt ? undefined : label}
      >
        {img}
      </Link>
    );
  } else if (fields.lightbox) {
    media = (
      <a
        href={fullUrl(fields.image)}
        className="os-image__link"
        data-os-lightbox=""
        data-os-caption={fields.caption ?? fields.image.alt}
        aria-label={fields.image.alt ? undefined : label}
      >
        {img}
      </a>
    );
  }
  return (
    <figure
      className={cx("os-image", `os-image--${variant}`, grid && "is-fill")}
      data-os-behavior={!fields.link && fields.lightbox ? "lightbox" : undefined}
    >
      {media}
      {fields.caption ? (
        <figcaption className="os-image__caption">{fields.caption}</figcaption>
      ) : null}
    </figure>
  );
}

export const imageCss = `
.os-image{position:relative;display:grid;gap:var(--os-space-2xs)}
.os-image.is-fill{height:100%;grid-template-rows:minmax(0,1fr) auto}
.os-image.is-fill>.os-image__link{display:block;height:100%}
.os-image__link{display:block;color:inherit;border-radius:var(--os-image-radius)}
.os-image__caption{font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-image--caption-overlay .os-image__caption{position:absolute;inset:auto 0 0 0;z-index:2;padding:var(--os-space-lg) var(--os-space-sm) var(--os-space-xs);color:var(--os-color-neutral-50);background:linear-gradient(to top,color-mix(in oklab,var(--os-color-neutral-950) 62%,transparent),color-mix(in oklab,var(--os-color-neutral-950) 0%,transparent));border-radius:0 0 var(--os-image-radius) var(--os-image-radius);pointer-events:none}
.os-image--inset{padding:var(--os-space-xs);background:var(--os-color-surface);border-radius:var(--os-radius-card)}
.os-image--inset .os-image__caption{padding:var(--os-space-3xs) var(--os-space-3xs) 0}
`;
