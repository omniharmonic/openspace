import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../../api/fixtures";
import type { Site } from "../../../api/types";
import { renderStudio, SAM } from "../../../test/render";
import { patchLayoutApis } from "../../../test/setup";
import { useEditorUi } from "../editor-store";
import { DEV_IDS as I } from "../model/dev-site";

/** The section toolbar's Stack/Grid switch follows the same capability as the inspector. */
const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));

async function openAs(role: Site["role"]) {
  const site = { ...(sites[0] as Site), role };
  renderStudio(`/sites/${site.id}`, { user: SAM, sites: [site, ...sites.slice(1)] });
  const frame = (await screen.findByTitle("Page canvas")) as HTMLIFrameElement;
  await waitFor(() => expect(frame.contentDocument?.querySelector("[data-os-page]")).toBeTruthy());
  patchLayoutApis(frame.contentWindow as Window & typeof globalThis);
  const doc = frame.contentDocument as Document;
  fireEvent.click(doc.querySelector(`[data-os-id="${I.hero}"][data-os-section]`) as HTMLElement);
  return screen.findByRole("radio", { name: "Grid layout" });
}

describe("section toolbar layout switch", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("is available to owners and designers", async () => {
    const grid = await openAs("owner");
    expect(grid).not.toBeDisabled();
  });

  it("is disabled for editors (section layout is the designer's)", async () => {
    const grid = await openAs("editor");
    expect(grid).toBeDisabled();
  });
});
