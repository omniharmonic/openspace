import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FidelityPanel } from "./MoveProgress";

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
