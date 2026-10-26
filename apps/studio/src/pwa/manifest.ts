/**
 * Studio's web app manifest (PRD §5.1, arch §5.1: installable, offline drafts). Kept as data
 * so the build (vite-plugin-pwa) and the tests read the same object.
 */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: "any" | "maskable" | "monochrome";
}

export interface WebAppManifest {
  name: string;
  short_name: string;
  description: string;
  id: string;
  start_url: string;
  scope: string;
  display: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  background_color: string;
  theme_color: string;
  lang: string;
  dir: "ltr" | "rtl";
  categories: string[];
  icons: ManifestIcon[];
  shortcuts?: Array<{ name: string; short_name?: string; url: string; icons?: ManifestIcon[] }>;
}

/** Chrome colors (tokens.css `--st-panel` light / dark). */
export const THEME_COLOR = "#ffffff";
export const THEME_COLOR_DARK = "#1c1d20";

export const STUDIO_MANIFEST: WebAppManifest = {
  name: "OpenSpace Studio",
  short_name: "OpenSpace",
  description: "Edit and publish your OpenSpace sites, on any device, even offline.",
  id: "/",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f3f3f1",
  theme_color: THEME_COLOR,
  lang: "en",
  dir: "ltr",
  categories: ["productivity", "design"],
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icons/icon-maskable-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  shortcuts: [
    { name: "Your sites", short_name: "Sites", url: "/sites" },
    { name: "Browse templates", short_name: "Templates", url: "/templates" },
  ],
};
