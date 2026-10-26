import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FAST, renderStudio } from "../../test/render";

describe("/kit", () => {
  it("showcases every UI kit section", async () => {
    renderStudio("/kit");
    expect(await screen.findByRole("heading", { name: "Studio UI kit" })).toBeInTheDocument();
    for (const name of [
      "Foundations",
      "Buttons",
      "Inputs",
      "Choices",
      "Color",
      "Overlays",
      "Feedback",
      "People",
      "Navigation",
      "Studio pieces",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("spinbutton").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("region", { name: "Get your site ready" })).toBeInTheDocument();
  });

  it("is absent when the kit is turned off (production)", async () => {
    renderStudio("/kit", {}, { ...FAST, showKit: false });
    expect(
      await screen.findByRole("heading", { name: "There’s nothing at this address" }),
    ).toBeInTheDocument();
  });
});
