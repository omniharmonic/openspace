import { join } from "node:path";
import type { PhoneProbeResult } from "@omniharmonic/openspace-lint";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { afterAll, describe, expect, it } from "vitest";
import { runCheck } from "./check";
import type { Screenshotter } from "./mcp/screenshot";
import { formatPhoneReport, runPhoneCheck } from "./phone";
import { cleanup, editJson, meadowCopy } from "./test-helpers";

afterAll(cleanup);

/** Squeeze the first stack section's text into side-by-side phone columns. */
async function squeeze(root: string): Promise<string> {
  const doc = await loadSiteDocument(root);
  const page =
    Object.values(doc.pages).find((p) => p.slug === "about") ?? Object.values(doc.pages)[0];
  const file = join(root, "content/pages", `${page?.slug || "home"}.json`);
  let sectionId = "";
  await editJson(file, (p) => {
    const s = p.sections.find(
      (x: { layout: { mode: string }; blocks: { type: string }[] }) =>
        x.layout.mode === "stack" && x.blocks.some((b) => b.type === "text"),
    );
    sectionId = s.id;
    s.layout.columns = { d: [6, 6], m: [4, 8] };
    const text = s.blocks.find((b: { type: string }) => b.type === "text");
    text.column = 0;
    text.fields.content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "We keep classes small so every teacher knows every name, and we start every class slowly enough that nobody is left behind on the first morning of the week.",
            },
          ],
        },
      ],
    };
  });
  return sectionId;
}

const fakeBrowser = (
  findings: PhoneProbeResult["findings"],
): Screenshotter & { urls: string[] } => {
  const urls: string[] = [];
  return {
    urls,
    async capture() {
      throw new Error("not used");
    },
    async measure(url, width) {
      urls.push(`${width} ${url}`);
      return { width, height: 780, scrollWidth: width, findings };
    },
    async close() {},
  };
};

describe("openspace check --phone", () => {
  it("plain `check` lists static phone problems as warnings (never failing the check)", async () => {
    const root = await meadowCopy();
    await squeeze(root);
    const report = await runCheck(root);
    const phone = report.findings.filter((f) => f.rule === "phone");
    expect(phone.length).toBeGreaterThan(0);
    expect(phone.every((f) => f.severity === "warning")).toBe(true);
    expect(phone[0]?.message).toMatch(/--phone --fix/);
    expect(report.ok).toBe(true);
  });

  it("measures every page as a phone at 360 and 390, as published", async () => {
    const root = await meadowCopy();
    const browser = fakeBrowser([
      { kind: "tap-target", area: "footer", tag: "a", text: "Privacy", value: 20, limit: 44 },
    ]);
    const r = await runPhoneCheck(root, { screenshotter: browser });
    expect(r.rendered).toBe(true);
    expect(browser.urls.some((u) => u.startsWith("360 ") && u.includes("os_mode=production"))).toBe(
      true,
    );
    expect(browser.urls.some((u) => u.startsWith("390 "))).toBe(true);
    // The footer finding repeats on every page but is reported once.
    expect(r.issues.filter((i) => i.rule === "phone-tap-target")).toHaveLength(1);
    const text = formatPhoneReport(r, (_c, s) => s);
    expect(text).toContain("Footer");
    expect(text).toMatch(/1 warning on phones/);
  });

  it("--fix fixes everything for phones in the content files", async () => {
    const root = await meadowCopy();
    const sectionId = await squeeze(root);
    const r = await runPhoneCheck(root, { screenshotter: fakeBrowser([]), fix: true });
    expect(r.fixed.map((f) => f.label)).toContain("Stack the columns on phones");
    expect(r.written.length).toBeGreaterThan(0);
    expect(r.counts.warning + r.counts.error).toBe(0);
    const doc = await loadSiteDocument(root);
    const s = Object.values(doc.pages)
      .flatMap((p) => p.sections)
      .find((x) => x.id === sectionId);
    expect(s?.layout.mode === "stack" && s.layout.columns).toEqual({ d: [6, 6], m: [12] });
  });

  it("falls back to the static rules without a browser", async () => {
    const root = await meadowCopy();
    await squeeze(root);
    const r = await runPhoneCheck(root, { rendered: false });
    expect(r.rendered).toBe(false);
    expect(r.issues.some((i) => i.rule === "phone-columns")).toBe(true);
  });
});
