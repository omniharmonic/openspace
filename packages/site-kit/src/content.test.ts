import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@openspace/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectionKind,
  loadSite,
  loadSiteDocument,
  pageFileFor,
  pageFileMatchesSlug,
  parseItemFile,
  SiteContentError,
  serializeItemFile,
  writeSiteDocument,
} from "./content/index";

const MEADOW = join(dirname(fileURLToPath(import.meta.url)), "../../../tools/fixtures/meadow-site");

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "os-content-"));
  await cp(MEADOW, dir, { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("file conventions", () => {
  it("maps page slugs to files and back", () => {
    expect(pageFileFor("")).toBe("home.json");
    expect(pageFileFor("about")).toBe("about.json");
    expect(pageFileFor("services/pricing")).toBe("services/pricing.json");
    expect(pageFileMatchesSlug("services/index.json", "services")).toBe(true);
    expect(pageFileMatchesSlug("home.json", "")).toBe(true);
    expect(pageFileMatchesSlug("about.json", "contact")).toBe(false);
  });

  it("infers collection kinds from _collection.json or conventional names", () => {
    expect(collectionKind("journal", undefined)).toBe("blog");
    expect(collectionKind("events", undefined)).toBe("events");
    expect(collectionKind("things", undefined)).toBeUndefined();
    expect(
      collectionKind("things", {
        kind: "products",
        label: "Things",
        list: { layout: "grid", pageSize: 12, sort: "title" },
      }),
    ).toBe("products");
  });

  it("round-trips Markdoc item files exactly", () => {
    const source =
      '---\ntitle: Hello\nstatus: published\ndate: 2026-10-26\ntags:\n  - a\n  - b\n---\n\nBody **text**.\n\n{% button href="/x" %}Go{% /button %}\n';
    const parsed = parseItemFile(source);
    expect(parsed.frontmatter).toEqual({
      title: "Hello",
      status: "published",
      date: "2026-10-26",
      tags: ["a", "b"],
    });
    expect(parsed.body.startsWith("Body")).toBe(true);
    expect(serializeItemFile(parsed as never)).toBe(source);
  });
});

describe("loadSiteDocument / writeSiteDocument", () => {
  it("loads a valid document with drafts, configs and media", async () => {
    const { doc, pageFiles } = await loadSite(dir);
    expect(doc.config.siteId).toBe("st_meadw00001");
    expect(
      Object.values(doc.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "about", "classes", "contact", "contact/thanks"]);
    expect(Object.values(pageFiles)).toContain("content/pages/contact/thanks.json");
    expect(Object.keys(doc.collections.journal ?? {})).toContain("draft-retreat-notes");
    expect(doc.collectionConfigs?.journal?.label).toBe("Journal");
    expect(doc.media["media/2026/10/studio-open.jpg"]?.width).toBe(1600);
  });

  it("load → write is a byte-for-byte no-op", async () => {
    const before = await readFile(
      join(dir, "content/collections/journal/2026-10-26-opening-day.mdoc"),
      "utf8",
    );
    const result = await writeSiteDocument(dir, await loadSiteDocument(dir));
    expect(result).toEqual({ written: [], removed: [] });
    expect(
      await readFile(join(dir, "content/collections/journal/2026-10-26-opening-day.mdoc"), "utf8"),
    ).toBe(before);
  });

  it("writes changes, moves pages whose slug changed and removes deleted pages and items", async () => {
    const doc = await loadSiteDocument(dir);
    const about = Object.values(doc.pages).find((p) => p.slug === "about") as Page;
    about.slug = "our-story";
    about.title = "Our story";
    const thanks = Object.values(doc.pages).find((p) => p.slug === "contact/thanks") as Page;
    delete (doc.pages as Record<string, Page>)[thanks.id];
    delete doc.collections.journal?.["draft-retreat-notes"];
    const result = await writeSiteDocument(dir, doc);
    expect(result.written).toEqual(["content/pages/our-story.json"]);
    expect(result.removed.sort()).toEqual([
      "content/collections/journal/draft-retreat-notes.mdoc",
      "content/pages/about.json",
      "content/pages/contact/thanks.json",
    ]);
    const again = await loadSiteDocument(dir);
    expect(Object.values(again.pages).find((p) => p.slug === "our-story")?.title).toBe("Our story");
    expect(again.collections.journal?.["draft-retreat-notes"]).toBeUndefined();
  });

  it("keeps a page at <slug>/index.json when it already lives there", async () => {
    const doc = await loadSiteDocument(dir);
    await mkdir(join(dir, "content/pages/classes"), { recursive: true });
    await cp(
      join(dir, "content/pages/classes.json"),
      join(dir, "content/pages/classes/index.json"),
    );
    await rm(join(dir, "content/pages/classes.json"));
    expect((await loadSite(dir)).pageFiles).toMatchObject(
      Object.fromEntries(
        Object.values(doc.pages)
          .filter((p) => p.slug === "classes")
          .map((p) => [p.id, "content/pages/classes/index.json"]),
      ),
    );
    expect(await writeSiteDocument(dir, doc)).toEqual({ written: [], removed: [] });
  });

  it("names the offending file and field on invalid content", async () => {
    const path = join(dir, "content/collections/events/open-house.mdoc");
    const text = await readFile(path, "utf8");
    await writeFile(path, text.replace("status: published", "status: live"));
    await writeFile(join(dir, "content/pages/about.json"), "{ nope");
    const err = await loadSiteDocument(dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SiteContentError);
    const issues = (err as SiteContentError).issues;
    expect(
      issues.find((i) => i.file === "content/collections/events/open-house.mdoc")?.path,
    ).toEqual(["frontmatter", "status"]);
    expect(issues.find((i) => i.file === "content/pages/about.json")?.message).toMatch(
      /Invalid JSON/,
    );
  });

  it("rejects a page whose slug doesn't match its file", async () => {
    const path = join(dir, "content/pages/about.json");
    const page = JSON.parse(await readFile(path, "utf8")) as Page;
    await writeFile(path, JSON.stringify({ ...page, slug: "elsewhere" }));
    await expect(loadSiteDocument(dir)).rejects.toThrow(/does not match its file location/);
  });
});
