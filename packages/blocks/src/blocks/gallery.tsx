import { cx, Img, Link, useRenderContext } from "@omniharmonic/openspace-renderer";
import {
  type AspectRatio,
  defineBlock,
  f,
  type ImageValue,
  type Link as LinkValue,
} from "@omniharmonic/openspace-schema";
import {
  ASPECT_OPTIONS,
  balancedColumns,
  CarouselControls,
  DEMO,
  sub,
  useImageUrl,
} from "../shared";

const COLUMN_OPTIONS = [
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
] as const;

export const galleryBlock = defineBlock({
  type: "gallery",
  version: 1,
  category: "media",
  label: "Gallery",
  icon: "images",
  description: "A set of photos as a grid, carousel, masonry wall, slideshow or justified strips.",
  fields: {
    images: f.list({
      min: 1,
      max: 60,
      itemLabel: "caption",
      fields: {
        image: f.image(),
        caption: f.text({ optional: true, maxLength: 160 }),
        link: f.link({ optional: true, help: "Link this photo instead of opening the lightbox" }),
      },
      default: [
        { image: DEMO.beachClass, caption: "Sunrise practice on the beach" },
        { image: DEMO.pilates, caption: "Foundations, Saturday mornings" },
        { image: DEMO.coffeeTable, caption: "Tea and coffee after every class" },
        { image: DEMO.forest, caption: "Our autumn retreat in the foothills" },
        { image: DEMO.beachPose, caption: "Evening flow" },
        { image: DEMO.livingRoom, caption: "The quiet room" },
      ],
    }),
    aspect: f.select({
      options: [{ value: "auto", label: "Automatic" }, ...ASPECT_OPTIONS],
      default: "auto",
      label: "Aspect ratio",
      help: "Crop for grid, carousel and slideshow. Automatic: portrait tiles, landscape slideshow.",
    }),
    columns: f.select({
      options: COLUMN_OPTIONS,
      default: "3",
      display: "segmented",
      help: "Columns on wide screens (grid and masonry)",
    }),
    lightbox: f.boolean({ default: true, help: "Open photos in a full-screen viewer" }),
    showCaptions: f.boolean({ default: false, label: "Show captions" }),
  },
  variants: ["grid", "carousel", "masonry", "slideshow", "strips"],
  styleSlots: ["radius", "imageTreatment", "padding", "animation"],
  ai: {
    purpose: "Several related photographs shown together.",
    whenToUse:
      "Portfolios, spaces, events and products. `grid` for tidy sets, `masonry` and `strips` for mixed orientations, `carousel` for many images in little space, `slideshow` for one large image at a time.",
    avoid:
      "Mixing unrelated photos; fewer than three images (use the image block); captions that repeat alt text.",
  },
  render: ({ id, fields, variant }) => <Gallery id={id} fields={fields} variant={variant} />,
});

type GalleryFields = Parameters<typeof galleryBlock.render>[0]["fields"];
type Item = GalleryFields["images"][number];

const SIZES: Record<string, string> = {
  grid: "(min-width: 1200px) 30vw, (min-width: 768px) 45vw, 100vw",
  masonry: "(min-width: 1200px) 30vw, (min-width: 768px) 45vw, 100vw",
  carousel: "(min-width: 1200px) 30vw, (min-width: 768px) 50vw, 85vw",
  slideshow: "(min-width: 1440px) 1440px, 100vw",
  strips: "(min-width: 768px) 40vw, 100vw",
};

/** Width / height of an image (stored, then media library, else a 3:2 guess). */
function useRatio(): (image: ImageValue) => number {
  const { doc } = useRenderContext();
  return (image) => {
    const meta = doc?.media[image.src];
    const w = image.width ?? meta?.width;
    const h = image.height ?? meta?.height;
    return w && h ? Math.round((w / h) * 1000) / 1000 : 1.5;
  };
}

function Gallery({ id, fields, variant }: { id: string; fields: GalleryFields; variant: string }) {
  const fullUrl = useImageUrl();
  const ratio = useRatio();
  const sizes = SIZES[variant] ?? SIZES.grid;
  const crop: AspectRatio | undefined =
    variant === "masonry" || variant === "strips"
      ? undefined
      : fields.aspect !== "auto"
        ? fields.aspect
        : variant === "slideshow"
          ? "3:2"
          : "4:5";
  const lightbox = fields.lightbox && fields.images.some((i) => !i.link);
  const carousel = variant === "carousel" || variant === "slideshow";

  const media = (item: Item, i: number) => {
    const img = <Img src={item.image} sizes={sizes} aspect={crop ?? "original"} />;
    if (item.link)
      return (
        <Link to={item.link as LinkValue} className="os-gallery__link">
          {img}
        </Link>
      );
    if (fields.lightbox)
      return (
        <a
          href={fullUrl(item.image)}
          className="os-gallery__link"
          data-os-lightbox=""
          data-os-caption={item.caption ?? item.image.alt}
          aria-label={item.image.alt ? undefined : item.caption || `Photo ${i + 1}`}
        >
          {img}
        </a>
      );
    return img;
  };

  const items = fields.images.map((item, i) => (
    <li
      // biome-ignore lint/suspicious/noArrayIndexKey: the same photo may appear twice
      key={i}
      className="os-gallery__item"
      style={variant === "strips" ? { "--ar": ratio(item.image) } : undefined}
    >
      <figure className="os-gallery__figure">
        {media(item, i)}
        {fields.showCaptions && item.caption ? (
          <figcaption className="os-gallery__caption">{item.caption}</figcaption>
        ) : null}
      </figure>
    </li>
  ));

  const behaviors = [carousel && "carousel", lightbox && "lightbox"].filter(Boolean).join(" ");
  const label = `Gallery, ${fields.images.length} photos`;

  if (carousel) {
    return (
      // biome-ignore lint/a11y/useSemanticElements: ARIA carousel pattern (group + roledescription), not a form fieldset
      <div
        className={cx("os-gallery", `os-gallery--${variant}`, "os-carousel")}
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        data-os-behavior={behaviors || undefined}
      >
        <ul className="os-carousel__track os-gallery__items" id={sub(id, "track")}>
          {items}
        </ul>
        {fields.images.length > 1 ? (
          <CarouselControls trackId={sub(id, "track")} noun="photos" />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cx("os-gallery", `os-gallery--${variant}`)}
      style={{
        "--g-cols": balancedColumns(fields.images.length, Number(fields.columns)),
        "--g-tcols": Math.min(Number(fields.columns), 3),
      }}
      data-os-behavior={behaviors || undefined}
    >
      <ul className="os-gallery__items" aria-label={label}>
        {items}
      </ul>
    </div>
  );
}

export const galleryCss = `
.os-gallery__items{margin:0}
.os-gallery__figure{display:grid;gap:var(--os-space-3xs);margin:0}
.os-gallery__link{display:block;color:inherit;border-radius:var(--os-image-radius)}
.os-gallery__caption{font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted)}
.os-block.has-radius .os-gallery .os-img{border-radius:var(--radius)}
.os-flip{transform:scaleX(-1)}

.os-gallery--grid .os-gallery__items{display:grid;gap:var(--os-space-xs);grid-template-columns:repeat(2,minmax(0,1fr))}
@container block (min-width:44rem){.os-gallery--grid .os-gallery__items{grid-template-columns:repeat(var(--g-tcols,3),minmax(0,1fr));gap:var(--os-space-sm)}}
@container block (min-width:64rem){.os-gallery--grid .os-gallery__items{grid-template-columns:repeat(var(--g-cols,3),minmax(0,1fr))}}
@container block (max-width:24rem){.os-gallery--grid .os-gallery__items{grid-template-columns:minmax(0,1fr)}}

.os-gallery--masonry .os-gallery__items{columns:2;column-gap:var(--os-space-xs)}
.os-gallery--masonry .os-gallery__item{break-inside:avoid;margin-bottom:var(--os-space-xs)}
.os-gallery--masonry .os-img{aspect-ratio:auto}
.os-gallery--masonry .os-img__img{height:auto}
@container block (min-width:44rem){.os-gallery--masonry .os-gallery__items{columns:var(--g-tcols,3);column-gap:var(--os-space-sm)}.os-gallery--masonry .os-gallery__item{margin-bottom:var(--os-space-sm)}}
@container block (min-width:64rem){.os-gallery--masonry .os-gallery__items{columns:var(--g-cols,3)}}
@container block (max-width:24rem){.os-gallery--masonry .os-gallery__items{columns:1}}

.os-gallery--strips .os-gallery__items{--row-h:6.5rem;display:flex;flex-wrap:wrap;gap:var(--os-space-2xs)}
.os-gallery--strips .os-gallery__items::after{content:"";flex-grow:999}
.os-gallery--strips .os-gallery__item{flex:var(--ar,1.5) 1 calc(var(--ar,1.5) * var(--row-h));min-width:0}
.os-gallery--strips .os-img{aspect-ratio:var(--ar,1.5)}
@container block (min-width:30rem){.os-gallery--strips .os-gallery__items{--row-h:10rem}}
@container block (min-width:44rem){.os-gallery--strips .os-gallery__items{--row-h:15rem;gap:var(--os-space-xs)}}
@container block (min-width:72rem){.os-gallery--strips .os-gallery__items{--row-h:19rem}}

.os-gallery--slideshow{--slide:100%}
.os-gallery--slideshow .os-carousel__track{gap:0}
.os-gallery--slideshow .os-gallery__figure{position:relative}
.os-gallery--slideshow .os-gallery__caption{position:absolute;inset:auto 0 0;z-index:2;padding:var(--os-space-lg) var(--os-space-sm) var(--os-space-sm);color:var(--os-color-neutral-50);background:linear-gradient(to top,color-mix(in oklab,var(--os-color-neutral-950) 60%,transparent),color-mix(in oklab,var(--os-color-neutral-950) 0%,transparent));pointer-events:none}
.os-gallery--slideshow .os-carousel__controls{position:absolute;inset-inline-end:var(--os-space-xs);bottom:var(--os-space-xs);z-index:3;margin:0}
.os-gallery--slideshow .os-carousel__btn{background:var(--os-color-background);border-color:transparent;box-shadow:var(--os-shadow-md)}
.os-gallery--slideshow .os-carousel__btn:hover:not([disabled]){background:var(--os-color-surface-raised)}
.os-gallery--slideshow:has(.os-gallery__caption) .os-carousel__controls{bottom:auto;top:var(--os-space-xs)}
`;
