import type {
  AspectRatio,
  FocalPoint,
  ImageTreatment,
  ImageValue,
  SiteDocument,
} from "@openspace/schema";
import { imageTreatmentClass } from "@openspace/theme";
import { createContext, useContext } from "react";
import { useImageMap, useRenderContext } from "./context";
import { type CssVars, cx } from "./cx";
import type { ImageMap, ResolvedImage } from "./image-map";
import { mediaUrl } from "./link";

/** Widths offered for remote images that support on-the-fly resizing (Unsplash, imgix). */
export const REMOTE_WIDTHS = [480, 768, 1080, 1440, 1920, 2400] as const;

export interface ImgProps {
  /** A media path / URL, or a full image value (src + alt + focal + dimensions). */
  src: string | ImageValue;
  /** Required unless `src` is an image value carrying `alt`. `""` marks a decorative image. */
  alt?: string;
  /** `sizes` attribute; describe the rendered width so the browser picks the right file. */
  sizes?: string;
  width?: number;
  height?: number;
  /** Focal point `[x, y]` (0..1); drives `object-position` when the image is cropped. */
  focal?: FocalPoint;
  /** Crop to an aspect ratio (`4:5`, `16:9`); `original` keeps the intrinsic ratio. */
  aspect?: AspectRatio;
  /**
   * Image treatment. Omitted: the site's default treatment (from Site Styles). `"none"` opts out.
   */
  treatment?: ImageTreatment;
  fit?: "cover" | "contain";
  /**
   * Fill the parent's height, cropping at the focal point (grid-mode cells: the cell's rows set
   * the height, the image never stretches the row).
   */
  fill?: boolean;
  /** Above-the-fold image: eager load + high fetch priority. */
  priority?: boolean;
  className?: string;
}

interface Resolved {
  src: string;
  srcset?: string | undefined;
  sources: { type: string; srcset: string }[];
  width?: number | undefined;
  height?: number | undefined;
  placeholder?: string | undefined;
}

/** Build a srcset for Unsplash/imgix-style URLs by rewriting the `w` query parameter. */
export function remoteSrcset(src: string, intrinsicWidth?: number): string | undefined {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return undefined;
  }
  if (url.hostname !== "images.unsplash.com" && !url.hostname.endsWith(".imgix.net"))
    return undefined;
  const widths = REMOTE_WIDTHS.filter((w) => !intrinsicWidth || w <= intrinsicWidth);
  if (widths.length === 0) return undefined;
  return widths
    .map((w) => {
      const u = new URL(url.toString());
      u.searchParams.set("w", String(w));
      if (!u.searchParams.has("auto")) u.searchParams.set("auto", "format");
      if (!u.searchParams.has("fit")) u.searchParams.set("fit", "max");
      return `${u.toString()} ${w}w`;
    })
    .join(", ");
}

/** Resolve an image source through the image map, the media library, then raw fallbacks. */
export function resolveImage(
  src: string,
  opts: {
    imageMap?: ImageMap | undefined;
    doc?: SiteDocument | undefined;
    basePath?: string;
    width?: number | undefined;
    height?: number | undefined;
  } = {},
): Resolved {
  const hit: ResolvedImage | undefined = opts.imageMap?.[src];
  if (hit) {
    return {
      src: hit.src,
      srcset: hit.srcset,
      sources: hit.sources ?? [],
      width: hit.width,
      height: hit.height,
      placeholder: hit.placeholder,
    };
  }
  const meta = opts.doc?.media[src];
  const width = opts.width ?? meta?.width;
  const height = opts.height ?? meta?.height;
  return {
    src: mediaUrl(src, opts.basePath),
    srcset: remoteSrcset(src, width),
    sources: [],
    width,
    height,
    placeholder: meta?.placeholder,
  };
}

function ratio(aspect: AspectRatio | undefined): string | undefined {
  if (!aspect || aspect === "original") return undefined;
  const [w, h] = aspect.split(":");
  return `${w} / ${h}`;
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/**
 * Above-the-fold images: the sources `SectionView` picked for the page's first section (the
 * first two in reading order, background first — the likely LCP element). Those load eagerly
 * with `fetchpriority="high"`; every other image loads lazily unless `priority` is set. A plain
 * value computed from the section, so rendering stays pure.
 */
export type AboveFold = ReadonlySet<string>;
export const AboveFoldContext = createContext<AboveFold | null>(null);

/**
 * Responsive image. Reads the `ImageResolverContext` map (AVIF/WebP sources, srcset, intrinsic
 * size, blurred placeholder), always emits width/height when known, crops with
 * `object-position` at the focal point, and applies image-treatment classes.
 */
export function Img(props: ImgProps) {
  const ctx = useRenderContext();
  const imageMap = useImageMap();
  const value: ImageValue | undefined = typeof props.src === "string" ? undefined : props.src;
  const src = typeof props.src === "string" ? props.src : props.src.src;
  const alt = props.alt ?? value?.alt ?? "";
  const focal = props.focal ?? value?.focal ?? ctx.doc?.media[src]?.focal;
  const r = resolveImage(src, {
    imageMap,
    doc: ctx.doc,
    basePath: ctx.basePath,
    width: props.width ?? value?.width,
    height: props.height ?? value?.height,
  });
  const sizes = props.sizes ?? "100vw";
  const aspect = props.fill ? undefined : ratio(props.aspect);
  const style: CssVars = {};
  if (aspect) style["--aspect"] = aspect;
  if (focal) style["--focal"] = `${pct(focal[0])} ${pct(focal[1])}`;
  const imgStyle = r.placeholder ? { backgroundImage: `url("${r.placeholder}")` } : undefined;
  const fold = useContext(AboveFoldContext);
  // Later images in the first section stay lazy: on phones they're below the fold, and on
  // larger screens the browser still fetches lazy images that are in view right away.
  const high = props.priority ?? fold?.has(src) ?? false;
  const eager = high;
  return (
    <span
      className={cx(
        "os-img",
        props.treatment && imageTreatmentClass(props.treatment),
        aspect && "has-aspect",
        props.fit === "contain" && "is-contain",
        props.fill && "is-fill",
        !props.fill && !aspect && (r.width === undefined || r.height === undefined) && "is-unsized",
        props.className,
      )}
      style={Object.keys(style).length ? style : undefined}
    >
      <picture>
        {r.sources.map((s) => (
          <source key={s.type} type={s.type} srcSet={s.srcset} sizes={sizes} />
        ))}
        <img
          className={cx("os-img__img", r.placeholder && "has-placeholder")}
          src={r.src}
          srcSet={r.srcset}
          sizes={r.srcset || r.sources.length ? sizes : undefined}
          width={r.width}
          height={r.height}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding={high ? "sync" : "async"}
          fetchPriority={high ? "high" : undefined}
          style={imgStyle}
        />
      </picture>
    </span>
  );
}
