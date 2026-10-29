import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FidelityPanel, matchWords, timeNote } from "./MoveProgress";

describe("How close it looks", () => {
  it("gives low page scores a plain next step", () => {
    render(
      <FidelityPanel
        fidelity={{
          score: 75,
          pages: [
            {
              path: "/contact",
              device: "phone",
              score: 44,
              image: null,
              differs: ["Section heights"],
            },
            { path: "/", device: "desktop", score: 90, image: null },
          ],
        }}
      />,
    );
    expect(screen.getByText("Still differs: Section heights")).toBeInTheDocument();
    expect(screen.getByText(/nothing is lost/)).toHaveTextContent(/Claude can compare it/);
  });

  it("says plainly when a move is rough, and when it was measured the older, generous way", () => {
    render(
      <FidelityPanel
        fidelity={{
          score: 0,
          rescaledFrom: 50,
          scorer: "v3.1-corrected",
          pages: [{ path: "/", device: "desktop", score: 0, image: null }],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "How close it looks: 0/100" })).toBeInTheDocument();
    expect(screen.getByText(/^Rough: your words and pictures came across/)).toBeInTheDocument();
    expect(screen.getByText(/older, more generous method \(it said 50\/100\)/)).toBeInTheDocument();
    expect(matchWords(95)).toBe("Practically identical");
    expect(matchWords(91)).toBe("Very close");
    expect(matchWords(64)).toMatch(/^The basics came across/);
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
