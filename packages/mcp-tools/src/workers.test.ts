import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));

describe("Workers compatibility", () => {
  it("has no Node built-in imports outside tests", () => {
    const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("test-helpers"),
    );
    for (const f of files) expect(readFileSync(join(SRC, f), "utf8"), f).not.toMatch(/from "node:/);
  });

  it("bundles for a browser/worker platform without Node built-ins", async () => {
    const require = createRequire(import.meta.url);
    const esbuild = (await import(
      require.resolve("esbuild", { paths: [require.resolve("tsup")] })
    )) as typeof import("esbuild");
    const r = await esbuild.build({
      entryPoints: [join(SRC, "index.ts")],
      bundle: true,
      platform: "browser",
      format: "esm",
      conditions: ["workerd", "worker", "browser"],
      write: false,
      logLevel: "silent",
      outfile: "out.js",
    });
    expect(r.errors).toEqual([]);
    expect(r.outputFiles?.[0]?.contents.length).toBeGreaterThan(0);
  }, 60_000);
});
