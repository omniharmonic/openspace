import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FidelityPanel, timeNote } from "./MoveProgress";

describe("How close it looks", () => {
  it("gives low page scores a plain next step", () => {
    render(
      <FidelityPanel
        fidelity={{
          score: 75,
          pages: [
            { path: "/contact", device: "phone", score: 44, differs: ["Section heights"] },
            { path: "/", device: "desktop", score: 90 },
          ],
        }}
      />,
    );
    expect(screen.getByText("Still differs: Section heights")).toBeInTheDocument();
    expect(screen.getByText(/nothing is lost/)).toBeInTheDocument();
  });
});

describe("how long a move takes", () => {
  it("is honest: a range at first, then how long this one has been going", () => {
    const t0 = Date.UTC(2026, 9, 27, 12, 0);
    const at = new Date(t0).toISOString();
    expect(timeNote(at, t0 + 30_000)).toMatch(/5 to 15 minutes/);
    expect(timeNote(at, t0 + 8 * 60_000)).toMatch(/^Started 8 minutes ago\./);
    expect(timeNote(at, t0 + 20 * 60_000)).toMatch(/taking longer than most/);
    expect(timeNote(at, t0 + 8 * 60_000)).not.toMatch(/a few minutes/);
  });
});
