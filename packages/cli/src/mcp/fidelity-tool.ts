/**
 * `compare_fidelity`: the served site against the original it was moved from, in a real browser
 * (local stdio server only; needs Playwright). Same measurement as `openspace compare`: fonts per
 * role, type sizes, spacing and each section at desktop and phone widths, with the Site Styles
 * settings (`set_styles`) that would close each gap and side-by-side images.
 */
import { readFile } from "node:fs/promises";
import { defineTool, ToolError, type ToolOutput } from "@omniharmonic/openspace-mcp-tools";
import { z } from "zod";
import { DESKTOP, PHONE, runCompare } from "../fidelity";

export interface FidelityToolOptions {
  siteRoot: string;
  /** Why browsers aren't available (Playwright missing), if they aren't. */
  unavailable?: string;
  /** Injected for tests. */
  compare?: typeof runCompare;
}

export function compareFidelityTool(opts: FidelityToolOptions) {
  return defineTool({
    name: "compare_fidelity",
    title: "Compare with the original site",
    description:
      "Measure how closely this site matches the original it was moved from: both are opened in a browser at desktop (1440) and phone (390) width and compared page by page and section by section — fonts for headings, text and labels, type sizes, letter spacing and capitals, content width, section padding, backgrounds, column counts, eyebrow rules, italic lines and image placement. Returns a 0–100 score, every difference with the Site Styles setting that would close it (use set_styles, then compare again), and side-by-side images (original left). Read-only; local server only.",
    input: z.object({
      original: z
        .string()
        .describe(
          "The original site's address, e.g. https://www.example.com or https://owner.github.io/name/",
        ),
      pages: z
        .array(z.string())
        .max(8)
        .optional()
        .describe('Site paths to compare, e.g. ["/", "/about"] (default: up to 6 pages).'),
      device: z.enum(["desktop", "mobile", "both"]).optional().describe('Default "both".'),
      images: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe(
          "How many side-by-side images to return (default 2; all are saved to .fidelity/).",
        ),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    async handler(_ctx, input): Promise<ToolOutput> {
      let u: URL;
      try {
        u = new URL(input.original.includes("://") ? input.original : `https://${input.original}`);
      } catch {
        throw new ToolError(`"${input.original}" is not a web address.`, "invalid_arguments");
      }
      if (opts.unavailable)
        throw new ToolError(
          `Comparing needs a browser here (${opts.unavailable}).`,
          "unsupported",
          [],
          "Install Playwright next to the CLI (npm i -D playwright && npx playwright install chromium) and restart the MCP server.",
        );
      const widths =
        input.device === "desktop"
          ? [DESKTOP]
          : input.device === "mobile"
            ? [PHONE]
            : [DESKTOP, PHONE];
      const run = opts.compare ?? runCompare;
      const r = await run(u.toString(), opts.siteRoot, {
        ...(input.pages?.length ? { pages: input.pages } : {}),
        widths,
      }).catch((e: Error) => {
        throw new ToolError(`Couldn't compare: ${e.message.split("\n")[0]}`, "fetch_failed");
      });
      const images: NonNullable<ToolOutput["images"]> = [];
      for (const file of r.images.slice(0, input.images ?? 2)) {
        const bytes = await readFile(file);
        images.push({
          base64: bytes.toString("base64"),
          mimeType: "image/png",
          caption: `Original (left) and this site (right): ${file.split("/").pop()}`,
        });
      }
      return {
        text: r.markdown,
        data: {
          score: r.report.score,
          pages: r.report.pages.map((p) => ({
            path: p.path,
            viewport: p.viewport,
            score: p.score,
            differences: [
              ...p.checks.filter((c) => !c.ok),
              ...p.sections.flatMap((s) =>
                s.checks
                  .filter((c) => !c.ok)
                  .map((c) => ({
                    ...c,
                    what: `Section ${s.index + 1}${s.heading ? ` "${s.heading}"` : ""}: ${c.what}`,
                  })),
              ),
            ].map(({ what, original, imported, fix }) => ({
              what,
              original,
              imported,
              ...(fix ? { fix } : {}),
            })),
          })),
          report: `${r.out}/FIDELITY-REPORT.md`,
        },
        images,
      };
    },
  });
}
