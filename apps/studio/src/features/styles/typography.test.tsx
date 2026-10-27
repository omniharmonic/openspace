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

  it("sets the site's own fonts, label capitals and eyebrow color, then resets them", async () => {
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTitle("Page canvas");
    await user.click(
      within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", {
        name: "Site styles",
      }),
    );
    const section = await screen.findByRole("button", { name: /Type & spacing/ });
    if (section.getAttribute("aria-expanded") === "false") await user.click(section);
    const headings = await screen.findByLabelText("Headings");
    await user.clear(headings);
    await user.type(headings, "Cormorant Garamond{Enter}");
    await waitFor(() =>
      expect(store().doc.styles.choices.typography?.heading).toEqual({
        family: "Cormorant Garamond",
        category: "serif",
        italic: true,
      }),
    );
    const labels = screen.getByLabelText("Labels");
    await user.type(labels, "bad;name{Enter}");
    expect(await screen.findByText(/as Google Fonts spells it/)).toBeInTheDocument();
    expect(store().doc.styles.choices.typography?.label).toBeUndefined();

    await user.click(screen.getByRole("switch", { name: "Labels in capitals" }));
    const scale = store().doc.styles.choices.typography?.scale;
    expect(scale?.eyebrow?.case).toBe("uppercase");
    expect(scale?.nav?.case).toBe("uppercase");
    expect(scale?.button?.case).toBe("uppercase");

    await user.click(screen.getByRole("radio", { name: "Muted" }));
    expect(store().doc.styles.choices.typography?.eyebrowColor).toBe("muted");

    await user.click(screen.getByRole("button", { name: /Reset to the pairing/ }));
    expect(store().doc.styles.choices.typography).toBeUndefined();
  });
});
