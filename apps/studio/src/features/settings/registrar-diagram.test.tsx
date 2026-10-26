import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_REGISTRARS } from "../../api/manage-mock";
import { REGISTRAR_SCREENS, RegistrarDiagram } from "./RegistrarDiagram";

const records = [
  { type: "A", host: "@", name: "example.org", value: "185.199.108.153" },
  { type: "CNAME", host: "www", name: "www.example.org", value: "maya.github.io" },
];

describe("registrar diagrams (FR-50)", () => {
  const known = MOCK_REGISTRARS.filter((g) => g.id !== "other");

  it("illustrates each of the top 8 registrars", () => {
    expect(known).toHaveLength(8);
    for (const g of known) expect(REGISTRAR_SCREENS[g.id], g.id).toBeDefined();
  });

  it.each(MOCK_REGISTRARS.filter((g) => g.id !== "other").map((g) => [g.id, g] as const))(
    "%s: draws its DNS screen with its own field names and the record filled in",
    (_id, g) => {
      const { unmount } = render(<RegistrarDiagram guide={g} records={records} />);
      const img = screen.getByRole("img");
      const label = img.getAttribute("aria-label") ?? "";
      const s = REGISTRAR_SCREENS[g.id];
      expect(label).toContain(s?.add);
      for (const c of s?.columns ?? []) expect(label).toContain(c.label);
      expect(label).toContain("185.199.108.153");
      // The apex host is written the registrar's way ("@" or empty).
      expect(label).toContain(g.hostApex ? `: ${g.hostApex}` : "(empty)");
      expect(img.querySelectorAll("image, foreignObject, script")).toHaveLength(0);
      unmount();
    },
  );

  it("draws nothing for the generic guide", () => {
    const other = MOCK_REGISTRARS.find((g) => g.id === "other");
    if (!other) return;
    const { container } = render(<RegistrarDiagram guide={other} records={records} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
