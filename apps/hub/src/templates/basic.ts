import type { Page, Site, SiteConfig, Styles } from "@omniharmonic/openspace-schema";
import type { BuiltinTemplate } from "../services/templates";

/**
 * "Basic" — the Hub's built-in fixture template. It exists so site creation, the dashboard and
 * the dev preview work end to end before the template registry (Task 9) is plugged in through
 * `TemplateSource`. One home page, a footer and three looks.
 */

const IDS = {
  site: "st_x5x6fppn3c",
  home: "pg_0kwdyvhkbk",
  hero: "sec_82grb86199",
  offer: "sec_x2z9xgd020",
  contact: "sec_3qsdyr3fyx",
  footer: "sec_djwbnnx98z",
  heroTitle: "blk_fa1xy14dt9",
  heroLead: "blk_2zehhz8y61",
  heroButton: "blk_mftmbvh3dx",
  heroImage: "blk_1v6xtvax6v",
  offerTitle: "blk_cpjkpm4c84",
  offer1: "blk_cp0brkg43g",
  offer2: "blk_bpn4hgbetr",
  offer3: "blk_971rq77xhb",
  contactTitle: "blk_c3cqhfb282",
  contactText: "blk_jrv3bsxtqv",
  footerText: "blk_wsrgcf98ht",
} as const;

const heading = (text: string, level: 1 | 2 | 3, preset: string) => ({
  type: "doc",
  content: [{ type: "heading", attrs: { level, preset }, content: [{ type: "text", text }] }],
});
const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const config: SiteConfig = {
  $schema: "https://schema.openspace.dev/v1/site-config.json",
  siteId: IDS.site,
  schemaVersion: 1,
  template: { id: "basic", version: "1.0.0" },
  hub: "http://localhost:8787",
  deploy: { target: "github-pages", url: "https://example.github.io/basic", customDomain: null },
  features: { forms: true, newsletter: true, analytics: true, search: false },
};

const site: Site = {
  $schema: "https://schema.openspace.dev/v1/site.json",
  title: "Basic",
  tagline: "A calm, simple home on the web.",
  nav: [{ type: "page", page: IDS.home, label: "Home" }],
  header: { variant: "classic-left", sticky: true, transparentOnHero: false, mobileMenu: "slide" },
  footer: {
    id: IDS.footer,
    layout: { mode: "stack", columns: { d: [12] }, align: "center" },
    style: { colorTheme: "dark", padding: { d: "lg" } },
    blocks: [
      {
        id: IDS.footerText,
        type: "text",
        v: 1,
        fields: { content: paragraph("Made with care. Say hello any time.") },
      },
    ],
  },
  locale: "en",
  seo: { titleTemplate: "%s — Basic" },
  integrations: { analytics: true, bookingUrl: null, stripeConnected: false },
};

const home: Page = {
  $schema: "https://schema.openspace.dev/v1/page.json",
  id: IDS.home,
  title: "Home",
  slug: "",
  seo: { title: null, description: "A calm, simple home on the web." },
  sections: [
    {
      id: IDS.hero,
      preset: "hero/split-image@1",
      layout: { mode: "stack", columns: { d: [6, 6], m: [12] }, align: "center" },
      style: { colorTheme: "light", padding: { d: "xl", m: "lg" }, minHeight: { d: "70vh" } },
      blocks: [
        {
          id: IDS.heroTitle,
          type: "text",
          v: 1,
          column: 0,
          fields: { content: heading("Basic", 1, "display") },
        },
        {
          id: IDS.heroLead,
          type: "text",
          v: 1,
          column: 0,
          fields: { content: paragraph("A calm, simple home on the web.") },
        },
        {
          id: IDS.heroButton,
          type: "button",
          v: 1,
          column: 0,
          fields: {
            label: "Get in touch",
            link: { type: "anchor", section: IDS.contact },
            variant: "primary",
          },
        },
        {
          id: IDS.heroImage,
          type: "image",
          v: 1,
          column: 1,
          fields: {
            image: {
              src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=2400&q=80",
              alt: "A bright, quiet workspace with plants by a large window",
              width: 2400,
              height: 1600,
            },
          },
          style: { radius: "lg" },
        },
      ],
    },
    {
      id: IDS.offer,
      layout: { mode: "stack", columns: { d: [4, 4, 4], m: [12] } },
      style: { colorTheme: "light-accent", padding: { d: "xl", m: "lg" } },
      blocks: [
        {
          id: IDS.offerTitle,
          type: "text",
          v: 1,
          column: 0,
          fields: { content: heading("What we do", 2, "h2") },
        },
        {
          id: IDS.offer1,
          type: "text",
          v: 1,
          column: 0,
          fields: {
            content: paragraph(
              "Thoughtful work, done at a steady pace and explained in plain words.",
            ),
          },
        },
        {
          id: IDS.offer2,
          type: "text",
          v: 1,
          column: 1,
          fields: {
            content: paragraph("Clear prices up front, and a reply to every message within a day."),
          },
        },
        {
          id: IDS.offer3,
          type: "text",
          v: 1,
          column: 2,
          fields: {
            content: paragraph(
              "Based locally, working with neighbours and small teams near and far.",
            ),
          },
        },
      ],
    },
    {
      id: IDS.contact,
      anchor: "contact",
      layout: { mode: "stack", columns: { d: [12] }, align: "center", width: "narrow" },
      style: { colorTheme: "light", padding: { d: "xl", m: "lg" } },
      blocks: [
        {
          id: IDS.contactTitle,
          type: "text",
          v: 1,
          fields: { content: heading("Let's talk", 2, "h2") },
        },
        {
          id: IDS.contactText,
          type: "text",
          v: 1,
          fields: { content: paragraph("Write to us and we'll get back to you soon.") },
        },
      ],
    },
  ],
};

const calm: Styles = {
  $schema: "https://schema.openspace.dev/v1/styles.json",
  choices: {
    palette: {
      brand: "oklch(0.62 0.09 145)",
      neutral: "warm",
      contrast: "standard",
      source: "curated",
    },
    pairing: "fraunces-hanken",
    density: "airy",
    shape: "soft",
    buttons: "pill-solid",
    motion: "subtle",
    imageTreatment: "rounded",
  },
};
const bold: Styles = {
  $schema: "https://schema.openspace.dev/v1/styles.json",
  choices: {
    palette: { brand: "oklch(0.55 0.2 265)", neutral: "cool", contrast: "high", source: "curated" },
    pairing: "space-grotesk-inter",
    density: "comfortable",
    shape: "sharp",
    buttons: "solid",
    motion: "expressive",
    imageTreatment: "none",
  },
};
const warm: Styles = {
  $schema: "https://schema.openspace.dev/v1/styles.json",
  choices: {
    palette: {
      brand: "oklch(0.6 0.13 45)",
      neutral: "warm",
      contrast: "standard",
      source: "curated",
    },
    pairing: "lora-inter",
    density: "comfortable",
    shape: "round",
    buttons: "pill-outline",
    motion: "subtle",
    imageTreatment: "arch",
  },
};

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

const AGENTS_MD = `# Editing this site

This site is built with OpenSpace. Content lives in \`content/\`; the rest is a thin shell.

- Pages are JSON files in \`content/pages/\` (folders mirror URLs; \`home.json\` is the home page).
- Every page, section and block has a stable \`id\`. Keep ids when editing.
- Change colors, fonts and spacing in \`content/styles.json\`, never with inline CSS.
- Never put passwords, API keys or private data in this repository: everything here is public.
- Run \`npx openspace check\` before committing.
`;

const PUBLISH_YML = `name: Publish
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          OPENSPACE_GOOGLE_FONTS: download
          OPENSPACE_REMOTE_IMAGES: download
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;

const PACKAGE_JSON = json({
  name: "openspace-site",
  private: true,
  type: "module",
  scripts: { dev: "astro dev", build: "astro build", check: "openspace check" },
  dependencies: { "@omniharmonic/openspace-site-kit": "^0.1.0", astro: "^5.0.0" },
  devDependencies: { "@omniharmonic/openspace-cli": "^0.1.0" },
});

const ASTRO_CONFIG = `import openspace from "@omniharmonic/openspace-site-kit";
import { defineConfig } from "astro/config";

export default defineConfig({ integrations: [openspace()] });
`;

const SLUG_PAGE = `---
export { getStaticPaths } from "@omniharmonic/openspace-site-kit/routes";
import Page from "@omniharmonic/openspace-site-kit/Page.astro";
---
<Page {...Astro.props} />
`;

export const basicTemplate: BuiltinTemplate = {
  meta: {
    id: "basic",
    name: "Basic",
    description:
      "A calm one-page site with a welcome, three short points and a way to get in touch.",
    persona: "Anyone starting out",
    mood: "Calm",
    version: "1.0.0",
    looks: [
      { id: "calm", name: "Calm", styles: calm },
      { id: "bold", name: "Bold", styles: bold },
      { id: "warm", name: "Warm", styles: warm },
    ],
    thumbnailUrl: null,
    sample: { name: "Juniper & Co.", tagline: "Thoughtful work, done at a steady pace" },
    slots: {
      title: { page: IDS.home, block: IDS.heroTitle },
      tagline: { page: IDS.home, block: IDS.heroLead },
    },
  },
  files: {
    "openspace.json": json(config),
    "content/site.json": json(site),
    "content/styles.json": json(calm),
    "content/pages/home.json": json(home),
    "AGENTS.md": AGENTS_MD,
    "package.json": PACKAGE_JSON,
    "astro.config.mjs": ASTRO_CONFIG,
    "src/pages/[...slug].astro": SLUG_PAGE,
    ".github/workflows/publish.yml": PUBLISH_YML,
    ".gitignore": "node_modules\ndist\n.astro\n",
  },
};
