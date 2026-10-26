import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadSiteDocument } from "../content/index";
import { deployLocation } from "../deploy";
import { planSite } from "../routes";
import { writeSiteOutputs } from "./postbuild";

const MEADOW = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tools/fixtures/meadow-site",
);
let tmp = "";
afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("writeSiteOutputs", () => {
  it("never writes outside the build directory (redirect path traversal)", async () => {
    tmp = await mkdtemp(join(tmpdir(), "os-postbuild-"));
    const outDir = join(tmp, "site", "dist");
    await mkdir(outDir, { recursive: true });
    const doc = await loadSiteDocument(MEADOW);
    // Bypasses schema validation on purpose: the writer must hold even if content is malformed.
    doc.site.redirects = [{ from: "/../../../escaped", to: "/", status: 301 }];
    const plan = planSite(doc, { now: new Date("2026-10-27T12:00:00Z") });
    await expect(
      writeSiteOutputs({
        outDir,
        rootDir: MEADOW,
        plan,
        location: deployLocation(doc.config),
        ogImages: false,
        cacheDir: join(tmp, "cache"),
      }),
    ).rejects.toThrow(/segments|outside the build directory/);
    expect(await readdir(tmp)).toEqual(["site"]);
    await expect(stat(join(tmp, "escaped"))).rejects.toThrow();
  });
});
