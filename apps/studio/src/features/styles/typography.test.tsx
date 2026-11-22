import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import type { EditorStore } from "../editor/model/store";
import { guessCategory } from "./SiteTypography";

describe("Site Styles → Type & spacing", () => {
  const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
  const willow = sites[0] as Site;
  const store = () =>
    (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();

  it("guesses a Google font's category from its name", () => {
    expect(guessCategory("Cormorant Garamond")).toBe("serif");
    expect(guessCategory("Montserrat")).toBe("sans-serif");
    expect(guessCategory("Source Sans 3")).toBe("sans-serif");
    expect(guessCategory("JetBrains Mono")).toBe("monospace");
  });

  it("picks fonts from the list, then sets label capitals and eyebrow color", async () => {
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTitle("Page canvas");
    await user.click(
      within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", {
        name: "Site styles",
      }),
    );
    await user.click(await screen.findByRole("button", { name: /^Headings font:/ }));
    const search = await screen.findByPlaceholderText("Search fonts");
    await user.type(search, "cormorant");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(store().doc.styles.choices.typography?.heading).toEqual({
        family: "Cormorant Garamond",
        category: "serif",
        italic: true,
      }),
    );
    // Back to the pairing's font from the same list.
    await user.click(await screen.findByRole("button", { name: /^Headings font:/ }));
    await user.click(await screen.findByRole("option", { name: /Pairing/ }));
    await waitFor(() => expect(store().doc.styles.choices.typography?.heading).toBeUndefined());

    await user.click(screen.getByRole("button", { name: /Advanced/ }));
    await user.click(screen.getByRole("switch", { name: "Labels in capitals" }));
    const scale = store().doc.styles.choices.typography?.scale;
    expect(scale?.eyebrow?.case).toBe("uppercase");
    expect(scale?.nav?.case).toBe("uppercase");
    expect(scale?.button?.case).toBe("uppercase");

    await user.click(screen.getByRole("radio", { name: "Muted" }));
    expect(store().doc.styles.choices.typography?.eyebrowColor).toBe("muted");
  });

  it("resizes a text style from its row, and every text at once", async () => {
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTitle("Page canvas");
    await user.click(
      within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", {
        name: "Site styles",
      }),
    );
    await user.click(await screen.findByRole("button", { name: /^Heading 2:/ }));
    const size = await screen.findByLabelText("Heading 2 size in pixels");
    await user.clear(size);
    await user.type(size, "50{Enter}");
    await waitFor(() => expect(store().doc.styles.choices.typography?.scale?.h2?.size).toBe(50));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Make all text larger" }));
    await waitFor(() => expect(store().doc.styles.choices.typography?.scale?.h2?.size).toBe(54));
  });
});
