import { fixForPhones } from "@omniharmonic/openspace-lint";
import type { SiteDocument } from "@omniharmonic/openspace-schema";

/**
 * Every import ends phone-ready: the Phone check's automatic fixes (phone layouts in reading
 * order, words first in heroes, stacked columns, lighter phone padding, shorter photo sections,
 * phone heading sizes) are applied to the imported document. They are phone-only settings, so
 * the desktop reproduction is unchanged. A line is added to the import report.
 */
export function phoneReady<T extends { doc: SiteDocument; report: string }>(result: T): T {
  let fixed: ReturnType<typeof fixForPhones>;
  try {
    fixed = fixForPhones(result.doc, { actor: "import", now: 0 });
  } catch {
    return result;
  }
  if (!fixed.ops.length) return result;
  const labels = [...new Set(fixed.fixed.map((f) => f.label.toLowerCase()))];
  const line = `\n## Phones\n\nMade ${fixed.fixed.length} phone-only adjustment${fixed.fixed.length === 1 ? "" : "s"} so the site reads well on phones (${labels.join(", ")}). The desktop design is unchanged.\n`;
  return { ...result, doc: fixed.doc, report: `${result.report.trimEnd()}\n${line}` };
}
