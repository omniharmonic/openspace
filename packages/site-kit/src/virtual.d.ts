/** Virtual modules provided by the `openspace()` integration's Vite plugin. */
declare module "virtual:openspace/site" {
  import type { SiteDocument } from "@omniharmonic/openspace-schema";
  import type { RuntimeOptions } from "@omniharmonic/openspace-site-kit";
  export const doc: SiteDocument;
  export const options: RuntimeOptions;
}

declare module "virtual:openspace/media" {
  /** Lazy imports of every image under `media/`, keyed `/media/…`. */
  export const mediaImports: Record<string, () => Promise<unknown>>;
}

declare module "astro:assets" {
  export const getImage: (options: {
    src: unknown;
    width?: number;
    widths?: number[];
    format?: string;
  }) => Promise<{ src: string; srcSet: { attribute: string } }>;
}
