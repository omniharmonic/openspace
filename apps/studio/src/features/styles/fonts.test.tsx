import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import type { EditorStore } from "../editor/model/store";
import { guessFace, guessFamily, prepareFontFile, sniffFontExt, withFont } from "./fonts";

const woff2 = (name = "StudioGrotesk-Bold.woff2") => {
  const b = new Uint8Array(512);
  b.set([0x77, 0x4f, 0x46, 0x32], 0); // "wOF2"
  b[300] = 9;
  return new File([b], name, { type: "font/woff2" });
};

describe("font upload helpers", () => {
  it("knows fonts by their bytes, not their names", async () => {
    expect(sniffFontExt(new Uint8Array([0x77, 0x4f, 0x46, 0x32]))).toBe("woff2");
    expect(sniffFontExt(new TextEncoder().encode("OTTO"))).toBe("otf");
    expect(sniffFontExt(new Uint8Array([0, 1, 0, 0]))).toBe("ttf");
    expect(sniffFontExt(new TextEncoder().encode("%PDF"))).toBeNull();
    await expect(
      prepareFontFile(new File(["%PDF-1.4"], "x.woff2"), "X", { weight: 400, style: "normal" }),
    ).rejects.toThrow(/isn't a WOFF2, TTF or OTF/);
  });

  it("guesses family, weight and style from file names and names files by content", async () => {
    expect(guessFace("Grotesk-SemiBoldItalic.woff2")).toEqual({ weight: 600, style: "italic" });
    expect(guessFace("grotesk_300.ttf")).toEqual({ weight: 300, style: "normal" });
    expect(guessFace("Grotesk-Regular.otf")).toEqual({ weight: 400, style: "normal" });
    expect(guessFamily("StudioGrotesk-Bold.woff2")).toBe("Studio Grotesk");
    const p = await prepareFontFile(woff2(), "Studio Grotesk", { weight: 700, style: "normal" });
    expect(p.path).toMatch(/^media\/fonts\/studio-grotesk-700-[0-9a-f]{8}\.woff2$/);
    expect(p.mime).toBe("font/woff2");
    const font = {
      family: "Studio Grotesk",
      category: "sans-serif" as const,
      files: [{ src: p.path, weight: 700, style: "normal" as const }],
      license: { webUse: true as const },
    };
    expect(withFont([font], { ...font, category: "display" })).toEqual([
      { ...font, category: "display" },
    ]);
  });
});

describe("Site Styles → Upload a font", () => {
  const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
  const willow = sites[0] as Site;

  it("uploads a licensed font, adds it to styles and uses it for headings", async () => {
    const { user, hub } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTitle("Page canvas");
    await user.click(
      within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", {
        name: "Site styles",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Upload a font" }));
    const form = screen.getByRole("form", { name: "Upload a font" });
    await user.upload(within(form).getByLabelText("Files"), woff2());
    expect(within(form).getByLabelText("Name")).toHaveValue("Studio Grotesk");
    const submit = within(form).getByRole("button", { name: "Upload font" });
    expect(submit).toBeDisabled();
    await user.click(within(form).getByRole("checkbox"));
    await user.click(submit);
    await waitFor(() => expect(hub.calls.some((c) => c.method === "uploadMedia")).toBe(true));
    const upload = hub.calls.find((c) => c.method === "uploadMedia");
    expect((upload?.args[2] as { path: string }).path).toMatch(
      /^media\/fonts\/studio-grotesk-700-/,
    );
    const store = () =>
      (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();
    await waitFor(() => expect(store().doc.styles.fonts?.[0]?.family).toBe("Studio Grotesk"));
    expect(store().doc.styles.fonts?.[0]?.license.webUse).toBe(true);
    const list = await screen.findByRole("list", { name: "Your fonts" });
    await user.click(within(list).getByRole("button", { name: "Headings" }));
    expect(store().doc.styles.choices.headingFont).toBe("Studio Grotesk");
  });
});
