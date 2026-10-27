import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blocksRegistry, PHOTOS, sectionPresets } from "@omniharmonic/openspace-blocks";
import { run, runCheck } from "@omniharmonic/openspace-cli";
import { designCheck, seoCheck } from "@omniharmonic/openspace-lint";
import { SiteDocumentSchema } from "@omniharmonic/openspace-schema";
import { planSite } from "@omniharmonic/openspace-site-kit";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { compileStyles } from "@omniharmonic/openspace-theme";
import { describe, expect, it } from "vitest";
import { listTemplates, loadTemplate, TEMPLATE_IDS, templateSource } from "../index";
import { remoteMedia } from "../lib/define";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.parse("2026-10-26T12:00:00Z");

/** Every string value in a JSON-safe value. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) strings(v, out);
  return out;
}

/**
 * Demo copy that ships with the block library and the section presets (written for other,
 * fictional businesses). A template must rewrite it all for its own owner.
 */
const DEMO_COPY = (() => {
  const set = new Set<string>();
  const add = (v: unknown) => {
    for (const s of strings(v)) if (s.trim().split(/\s+/).length >= 5) set.add(s);
  };
  for (const p of sectionPresets) add(p.build().blocks.map((b) => b.fields));
  const reg = blocksRegistry();
  for (const type of reg.types()) add(reg.get(type)?.create({}).fields);
  // Photo descriptions belong to the shared, credited photo library, not to a preset.
  for (const p of Object.values(PHOTOS)) set.delete(p.alt);
  return set;
})();

const PLACEHOLDER_RE =
  /lorem|ipsum|\bTODO\b|\bTBD\b|\bFIXME\b|\[(?:[A-Z][A-Za-z ]+)\]|\{\{|xxx|example text|your (?:name|business) here/i;

const HOSTING_RULES = new Set(["needs-cloudflare", "gated-page", "gated-link"]);

describe("registry", () => {
  it("lists the twelve launch templates with three looks each", () => {
    const list = listTemplates();
    expect(list.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
    for (const t of list) {
      expect(t.looks).toHaveLength(3);
      expect(new Set(t.looks.map((l) => l.id)).size).toBe(3);
      expect(t.name && t.description && t.persona && t.mood).toBeTruthy();
      expect(t.pages.some((p) => p.id === t.thumbnailPage)).toBe(true);
    }
  });

  it("serves the Hub's TemplateSource shape", async () => {
    const [first] = await templateSource.list();
    const loaded = await templateSource.load(first?.id ?? "");
    expect(loaded?.files["openspace.json"]).toBeTruthy();
    expect(loaded?.files["content/site.json"]).toBeTruthy();
    expect(await templateSource.load("nope")).toBeNull();
  });
});

describe.each(TEMPLATE_IDS)("template %s", (id) => {
  const t = loadTemplate(id);
  if (!t) throw new Error(id);
  const { doc, meta, licenses } = t;
  const pages = Object.values(doc.pages);

  it("is a valid site document", () => {
    const r = SiteDocumentSchema.safeParse(doc);
    expect(r.success ? [] : r.error.issues).toEqual([]);
    expect(blocksRegistry().validateDocument(doc)).toEqual([]);
  });

  it("has the pages every template needs", () => {
    const slugs = pages.map((p) => p.slug);
    expect(slugs).toContain("");
    if (id !== "link") {
      expect(slugs).toContain("about");
      // A way to get in touch: contact, visit (restaurants), RSVP (weddings), join (movements).
      expect(slugs.some((s) => /^(?:contact|visit|rsvp|join)$/.test(s))).toBe(true);
      expect(pages.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("passes the Design check with no errors or warnings", () => {
    const issues = designCheck(doc, undefined, { now: NOW });
    const shown = issues
      // Hosting notes (donations / shop / members-only on GitHub Pages) aren't design problems.
      .filter((i) => i.severity !== "info" && !HOSTING_RULES.has(i.rule))
      .map((i) => `${i.severity} ${i.rule} ${i.page ?? ""} ${i.section ?? ""}: ${i.message}`);
    expect(shown.join("\n")).toBe("");
  });

  it("passes the SEO check (no warnings; descriptions 50–160 characters, unique)", () => {
    for (const p of pages) {
      const issues = seoCheck(p, doc, { now: NOW });
      const bad = issues
        .filter(
          (i) =>
            i.severity === "warning" ||
            [
              "seo-description-length",
              "seo-description-duplicate",
              "seo-description-missing",
            ].includes(i.rule),
        )
        .map((i) => `${p.slug || "home"} ${i.rule}: ${i.message}`);
      expect(bad.join("\n")).toBe("");
    }
  });

  it("passes the SEO check on every collection item page too", () => {
    const plan = planSite(doc, { now: new Date(NOW) });
    const bad: string[] = [];
    for (const route of plan.routes.filter((r) => r.kind === "item")) {
      const p = plan.doc.pages[route.pageId as keyof typeof plan.doc.pages];
      if (!p) continue;
      for (const i of seoCheck(p, plan.doc, { now: NOW }))
        if (
          i.severity === "warning" ||
          ["seo-description-length", "seo-description-missing"].includes(i.rule)
        )
          bad.push(`${route.path} ${i.rule}: ${i.message}`);
    }
    expect(bad.join("\n")).toBe("");
  });

  it("never uses one portrait for two different named people", () => {
    const byPhoto = new Map<string, Set<string>>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) for (const x of v) walk(x);
      else if (v && typeof v === "object") {
        const o = v as { name?: unknown; photo?: { src?: string } };
        if (typeof o.name === "string" && o.photo?.src) {
          const key = o.photo.src.split("?")[0] as string;
          byPhoto.set(key, (byPhoto.get(key) ?? new Set()).add(o.name.replace(/,.*$/, "")));
        }
        for (const x of Object.values(v)) walk(x);
      }
    };
    walk(doc.pages);
    const clashes = [...byPhoto]
      .filter(([, names]) => names.size > 1)
      .map(([src, n]) => `${src}: ${[...n].join(" / ")}`);
    expect(clashes.join("\n")).toBe("");
  });

  it("compiles every look with zero contrast failures", () => {
    for (const look of meta.looks) {
      const compiled = compileStyles(look.styles);
      expect(compiled.contrast.failures, look.id).toEqual([]);
      expect(
        compiled.warnings.filter((w) => w.code !== "contrast-adjusted"),
        look.id,
      ).toEqual([]);
      const lookDoc = { ...doc, styles: look.styles };
      const errors = designCheck(lookDoc, undefined, { now: NOW }).filter(
        (i) => i.severity === "error",
      );
      expect(errors, look.id).toEqual([]);
    }
  });

  it("credits every photo and media file in media/LICENSES.json", () => {
    const used = remoteMedia(doc);
    const credited = licenses.media.map((m) => m.src);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(credited, u).toContain(u);
    for (const c of credited) expect(used, c).toContain(c);
    for (const m of licenses.media) {
      expect(m.author.length).toBeGreaterThan(1);
      expect(m.sourceUrl).toMatch(/^https:\/\//);
      expect(m.licenseUrl).toMatch(/^https:\/\//);
    }
  });

  it("is written for its owner: no placeholders, no library demo copy", () => {
    const all = strings({ site: doc.site, pages: doc.pages, collections: doc.collections });
    expect(all.filter((s) => PLACEHOLDER_RE.test(s)).join("\n")).toBe("");
    expect(all.filter((s) => DEMO_COPY.has(s)).join("\n")).toBe("");
  });

  it("passes `openspace check` and scaffolds with `openspace new`", async () => {
    const report = await runCheck(join(ROOT, id));
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    const tmp = await mkdtemp(join(tmpdir(), `os-tpl-${id}-`));
    try {
      const out: string[] = [];
      const io = {
        cwd: tmp,
        env: {},
        out: (s: string) => out.push(s),
        err: (s: string) => out.push(s),
        nodeVersion: process.versions.node,
      };
      const code = await run(["new", id, "site", "--templates-dir", ROOT], io);
      expect(code, out.join("\n")).toBe(0);
      expect(out.join("\n")).not.toMatch(/fixture|fallback|stand/i);
      const created = await loadSiteDocument(join(tmp, "site"));
      expect(Object.keys(created.pages).sort()).toEqual(Object.keys(doc.pages).sort());
      expect(created.config.template.id).toBe(id);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
