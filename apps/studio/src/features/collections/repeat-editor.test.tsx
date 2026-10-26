import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../../ui";
import { RepeatEditor } from "./RepeatEditor";

function Harness({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (v: string | undefined) => void;
}) {
  const [value, setValue] = useState<string | undefined>(initial);
  return (
    <TooltipProvider>
      <RepeatEditor
        start="2026-11-03"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </TooltipProvider>
  );
}

describe("repeat editor", () => {
  it("shows rules it can't repeat as read-only text, without an error, and never rewrites them", () => {
    const onChange = vi.fn();
    render(<Harness initial="FREQ=HOURLY;INTERVAL=2" onChange={onChange} />);
    const field = screen.getByDisplayValue("FREQ=HOURLY;INTERVAL=2");
    expect(field).toHaveAttribute("readonly");
    expect(screen.getByText(/can't show yet/)).toBeInTheDocument();
    expect(screen.queryByText(/isn't a repeat rule/)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("limits custom rules to 300 characters and saves only valid ones", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="FREQ=MONTHLY;BYDAY=-1TU" onChange={onChange} />);
    const field = screen.getByDisplayValue("FREQ=MONTHLY;BYDAY=-1TU");
    expect(field).toHaveAttribute("maxlength", "300");
    await user.clear(field);
    await user.type(field, "nope");
    await user.tab();
    expect(screen.getByText(/isn't a repeat rule/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, "FREQ=MONTHLY;BYDAY=-1FR");
    expect(onChange).not.toHaveBeenCalled(); // nothing saved while typing
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith("FREQ=MONTHLY;BYDAY=-1FR");
  });
});
