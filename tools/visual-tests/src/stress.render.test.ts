/**
 * Stress-render harness (skipped in normal runs). With `OS_STRESS=<dir>` it writes:
 * - `<dir>/presets/<preset>/index.html`: every section preset once per stress variation
 *   (`VARIATIONS`), stacked, inside the Meadow site (its header, footer and styles);
 * - `<dir>/headers/<template>-<case>/index.html`: each template's home page with a long site
 *   name, and with a very wide logo;
 * - `<dir>/manifest.json`: which section is which variation, for `scripts/stress.mjs`.
 * `OS_STRESS_PRESETS=hero-split,faq-accordion` limits the presets.
 */
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blocksRegistry, sectionPresets } from "@omniharmonic/openspace-blocks";
import type { Page, Section, SiteDocument } from "@omniharmonic/openspace-schema";
import { deployLocation, planSite, renderRoute } from "@omniharmonic/openspace-site-kit";
import { loadTemplate, TEMPLATE_IDS } from "@omniharmonic/openspace-templates";
import { it } from "vitest";
import {
  applyVariation,
  changes,
  type FieldMetas,
  LONG_SITE_NAME,
  VARIATIONS,
  WIDE_LOGO,
} from "./stress";

const OUT = process.env.OS_STRESS;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NOW = new Date("2026-10-26T12:00:00Z");

/** A copy of a section with its own ids (variations sit side by side on one page). */
function reid(section: Section, suffix: string): Section {
  const map = new Map<string, string>(section.blocks.map((b) => [b.id, `${b.id}${suffix}`]));
  const layout =
    section.layout.mode === "grid"
      ? {
          ...section.layout,
          items: Object.fromEntries(
            Object.entries(section.layout.items).map(([k, v]) => [map.get(k) ?? k, v]),
          ),
        }
      : section.layout;
  return {
    ...section,
    id: `${section.id}${suffix}` as Section["id"],
    layout: layout as Section["layout"],
    blocks: section.blocks.map((b) => ({ ...b, id: map.get(b.id) as typeof b.id })),
  };
}

function render(doc: SiteDocument, pageId: string): string {
  const d = {
    ...doc,
    config: {
      ...doc.config,
      deploy: { ...doc.config.deploy, url: "http://localhost/", customDomain: null },
    },
  } as SiteDocument;
  const plan = planSite(d, { now: NOW });
  const route = plan.routes.find((r) => r.pageId === pageId);
  if (!route) throw new Error(`no route for ${pageId}`);
  return renderRoute({ plan, route, location: deployLocation(d.config), ogImages: false });
}

function write(file: string, html: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

it.skipIf(!OUT)("renders every section preset under stress, and long names in headers", () => {
  const dir = OUT as string;
  cpSync(join(ROOT, "packages/renderer/dist/behaviors"), join(dir, "_os/behaviors"), {
    recursive: true,
  });
  const metas = new Map(
    blocksRegistry()
      .meta()
      .map((m) => [m.type, m.fields as FieldMetas]),
  );
  const metaOf = (type: string) => metas.get(type);
  const host = loadTemplate("meadow");
  if (!host) throw new Error("meadow template missing");
  const home = Object.values(host.doc.pages).find((p) => p.slug === "") as Page;
  const only = process.env.OS_STRESS_PRESETS?.split(",");
  const manifest: {
    presets: { id: string; path: string; sections: { id: string; variant: string }[] }[];
    headers: { id: string; path: string }[];
  } = { presets: [], headers: [] };

  for (const preset of sectionPresets.filter((p) => !only || only.includes(p.id))) {
    const base = preset.build();
    const sections: Section[] = [];
    const listed: { id: string; variant: string }[] = [];
    VARIATIONS.forEach(({ id, variation }, i) => {
      if (variation.kind !== "base" && !changes(base, variation, metaOf)) return;
      const s = reid(applyVariation(base, variation, metaOf), `v${i}`);
      sections.push(s);
      listed.push({ id: s.id, variant: id });
    });
    const page = { ...home, sections } as Page;
    const doc = { ...host.doc, pages: { ...host.doc.pages, [home.id]: page } } as SiteDocument;
    const path = `presets/${preset.id}/`;
    write(join(dir, path, "index.html"), render(doc, home.id));
    manifest.presets.push({ id: preset.id, path, sections: listed });
  }

  if (!only)
    for (const id of TEMPLATE_IDS) {
      const t = loadTemplate(id);
      if (!t) continue;
      const tHome = Object.values(t.doc.pages).find((p) => p.slug === "") as Page;
      const cases: Record<string, SiteDocument["site"]> = {
        "long-name": { ...t.doc.site, title: LONG_SITE_NAME, logo: null },
        "wide-logo": {
          ...t.doc.site,
          logo: { src: WIDE_LOGO, alt: "Riverside Collective", width: 1200, height: 120 },
        },
      };
      for (const [name, site] of Object.entries(cases)) {
        const path = `headers/${id}-${name}/`;
        write(join(dir, path, "index.html"), render({ ...t.doc, site }, tHome.id));
        manifest.headers.push({ id: `${id}-${name}`, path });
      }
    }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
});
