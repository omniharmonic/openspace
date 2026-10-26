import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planSite, renderRoute } from "@openspace/site-kit";
import { it } from "vitest";
import { loadTemplate, TEMPLATE_IDS } from "../index";

/**
 * Visual review harness (skipped in normal runs). With `OS_TEMPLATE_RENDER=<dir>` it writes
 * every page of every template in each look to `<dir>/<template>/<look>/<path>index.html`, plus
 * the renderer's behaviors at `<dir>/_os/behaviors`, for screenshots at 1440 and 390.
 * `OS_TEMPLATES=meadow,harbor` limits the templates; `OS_LOOKS=1` only the first look.
 */
const OUT = process.env.OS_TEMPLATE_RENDER;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

it.skipIf(!OUT)("renders every template page in each look", () => {
  const dir = OUT as string;
  cpSync(join(ROOT, "../packages/renderer/dist/behaviors"), join(dir, "_os/behaviors"), {
    recursive: true,
  });
  const only = process.env.OS_TEMPLATES?.split(",");
  const looks = Number(process.env.OS_LOOKS ?? 3);
  for (const id of TEMPLATE_IDS.filter((t) => !only || only.includes(t))) {
    const t = loadTemplate(id);
    if (!t) continue;
    for (const look of t.meta.looks.slice(0, looks)) {
      const base = `/${id}/${look.id}`;
      const doc = {
        ...t.doc,
        styles: look.styles,
        config: {
          ...t.doc.config,
          deploy: {
            ...t.doc.config.deploy,
            url: `http://localhost:8799${base}`,
            customDomain: null,
          },
        },
      };
      const plan = planSite(doc, { now: new Date("2026-10-26T12:00:00Z") });
      const location = {
        site: "http://localhost:8799",
        base,
        basePath: base,
        siteUrl: `http://localhost:8799${base}/`,
      };
      for (const route of plan.routes) {
        if (route.kind === "notFound" || route.kind === "tag" || route.kind === "category")
          continue;
        const html = renderRoute({ plan, route, location, ogImages: false });
        const file = join(dir, id, look.id, route.path, "index.html");
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, html.replaceAll(`${base}/_os/behaviors`, "/_os/behaviors"));
      }
    }
  }
});
