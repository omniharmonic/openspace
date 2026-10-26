import { defineBlock, f, type ImageValue, type Link, type RichTextDoc } from "@openspace/schema";
import { Img } from "../image";
import { Button } from "../primitives";
import { RichText } from "../richtext";

/** Local fixture blocks (the renderer must not depend on @openspace/blocks). */
export const textBlock = defineBlock({
  type: "text",
  version: 1,
  category: "text",
  label: "Text",
  icon: "type",
  fields: { content: f.richText() },
  ai: { purpose: "Running text.", whenToUse: "Anywhere words are needed." },
  render: ({ fields }) => <RichText doc={fields.content as RichTextDoc} />,
});

export const buttonBlock = defineBlock({
  type: "button",
  version: 1,
  category: "navigation",
  label: "Button",
  icon: "mouse-pointer-click",
  fields: {
    label: f.text({ maxLength: 60 }),
    link: f.link(),
    variant: f.select({
      options: [
        { value: "primary", label: "Primary" },
        { value: "secondary", label: "Secondary" },
        { value: "tertiary", label: "Tertiary" },
      ],
      default: "primary",
    }),
  },
  ai: { purpose: "A call to action.", whenToUse: "One primary action per section." },
  render: ({ fields }) => (
    <Button to={fields.link as Link} role={fields.variant as "primary"}>
      {fields.label as string}
    </Button>
  ),
});

export const imageBlock = defineBlock({
  type: "image",
  version: 2,
  category: "media",
  label: "Image",
  icon: "image",
  fields: { image: f.image(), caption: f.text({ optional: true }) },
  styleSlots: ["radius", "imageTreatment", "align", "padding", "animation"],
  migrate: { 1: (v1) => ({ ...v1 }) },
  ai: { purpose: "A photograph.", whenToUse: "Show the place, people or product." },
  render: ({ fields }) => (
    <figure>
      <Img src={fields.image as ImageValue} sizes="(min-width: 1200px) 40vw, 100vw" aspect="4:5" />
      {fields.caption ? <figcaption>{fields.caption as string}</figcaption> : null}
    </figure>
  ),
});

export const galleryBlock = defineBlock({
  type: "gallery",
  version: 1,
  category: "media",
  label: "Gallery",
  icon: "images",
  fields: { images: f.list({ fields: { image: f.image() } }) },
  variants: ["carousel", "grid"],
  ai: { purpose: "Several photos.", whenToUse: "Show a set of images." },
  render: ({ fields, variant }) => {
    const images = (fields.images as { image: ImageValue }[]).map((i) => i.image);
    return variant === "carousel" ? (
      <div className="os-carousel" data-os-behavior="carousel lightbox">
        <ul className="os-carousel__track" aria-label="Gallery">
          {images.map((img) => (
            <li key={img.src}>
              <a href={img.src} data-os-lightbox="">
                <Img src={img} sizes="33vw" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : (
      <div className="os-cards">
        {images.map((img) => (
          <Img key={img.src} src={img} sizes="33vw" />
        ))}
      </div>
    );
  },
});

export const fixtureBlocks = [textBlock, buttonBlock, imageBlock, galleryBlock];
