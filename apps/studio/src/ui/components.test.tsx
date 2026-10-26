import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AvatarStack,
  Badge,
  Button,
  ColorPickerPanel,
  type ColorValue,
  CommandPalette,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kbd,
  Menu,
  NumberScrubInput,
  Segmented,
  Tabs,
  Toaster,
  Toggle,
  TooltipProvider,
  toast,
  useCommandStore,
  useRegisterCommands,
  useToastStore,
} from "./index";

function wrap(ui: React.ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

afterEach(() => {
  useToastStore.getState().clear();
  useCommandStore.setState({ open: false, sources: {} });
});

describe("Button", () => {
  it("fires clicks and is disabled while loading", async () => {
    const onClick = vi.fn();
    const { rerender } = wrap(<Button onClick={onClick}>Publish</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <TooltipProvider>
        <Button onClick={onClick} loading>
          Publish
        </Button>
      </TooltipProvider>,
    );
    const btn = screen.getByRole("button", { name: "Publish" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("defaults to type=button so it never submits forms by accident", () => {
    wrap(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("IconButton + Tooltip", () => {
  it("is labelled and shows a tooltip with the shortcut on focus", async () => {
    wrap(<IconButton label="Undo" icon={<svg />} shortcut="mod+z" />);
    const btn = screen.getByRole("button", { name: "Undo" });
    await act(async () => btn.focus());
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Undo");
    expect(tip).toHaveTextContent(/Ctrl|⌘/);
  });

  it("reflects toggle state with aria-pressed", () => {
    wrap(<IconButton label="Layers" icon={<svg />} active tooltip={false} />);
    expect(screen.getByRole("button", { name: "Layers" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Kbd", () => {
  it("renders each key", () => {
    render(<Kbd shortcut="shift+mod+z" platform="mac" />);
    expect(screen.getByText("⇧")).toBeInTheDocument();
    expect(screen.getByText("⌘")).toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("labels the control and links hint and error", () => {
    const { rerender } = render(
      <Field label="Site name" hint="Shown in search results">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Site name");
    expect(input).toHaveAccessibleDescription("Shown in search results");
    rerender(
      <Field label="Site name" error="Give your site a name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Site name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Give your site a name");
  });
});

function Scrub(props: {
  initial?: number | null;
  min?: number;
  max?: number;
  step?: number;
  onEnd?: (v: number) => void;
}) {
  const [v, setV] = useState<number | null>(props.initial === undefined ? 10 : props.initial);
  return (
    <>
      <NumberScrubInput
        label="Width"
        value={v}
        onChange={setV}
        onChangeEnd={props.onEnd}
        min={props.min}
        max={props.max}
        step={props.step}
        unit="px"
      />
      <output data-testid="value">{String(v)}</output>
    </>
  );
}

describe("NumberScrubInput", () => {
  it("accepts typed math and commits on Enter", async () => {
    const onEnd = vi.fn();
    render(<Scrub onEnd={onEnd} />);
    const input = screen.getByRole("spinbutton", { name: "Width" });
    await userEvent.clear(input);
    await userEvent.type(input, "24*2{Enter}");
    expect(screen.getByTestId("value")).toHaveTextContent("48");
    expect(onEnd).toHaveBeenCalledWith(48);
  });

  it("reverts invalid input and Escape", async () => {
    render(<Scrub />);
    const input = screen.getByRole("spinbutton", { name: "Width" });
    await userEvent.clear(input);
    await userEvent.type(input, "abc");
    await userEvent.tab();
    expect((input as HTMLInputElement).value).toBe("10");
    await userEvent.clear(input);
    await userEvent.type(input, "99{Escape}");
    expect((input as HTMLInputElement).value).toBe("10");
    expect(screen.getByTestId("value")).toHaveTextContent("10");
  });

  it("nudges with arrow keys (shift ×10) and clamps", async () => {
    render(<Scrub min={0} max={25} />);
    const input = screen.getByRole("spinbutton", { name: "Width" });
    input.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByTestId("value")).toHaveTextContent("11");
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(screen.getByTestId("value")).toHaveTextContent("21");
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(screen.getByTestId("value")).toHaveTextContent("25");
    await userEvent.keyboard("{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}");
    expect(screen.getByTestId("value")).toHaveTextContent("0");
  });

  it("scrubs by dragging the handle and reports the end value once", () => {
    const onEnd = vi.fn();
    render(<Scrub onEnd={onEnd} />);
    const handle = screen.getByTestId("scrub-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 120, pointerId: 1 });
    expect(screen.getByTestId("value")).toHaveTextContent("20");
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1, shiftKey: true });
    expect(screen.getByTestId("value")).toHaveTextContent("210");
    fireEvent.pointerUp(handle, { clientX: 140, pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(210);
  });

  it("shows Mixed for null values", () => {
    render(<Scrub initial={null} />);
    expect((screen.getByRole("spinbutton", { name: "Width" }) as HTMLInputElement).value).toBe(
      "Mixed",
    );
  });
});

describe("Segmented and Toggle", () => {
  it("selects one option and never deselects", async () => {
    const onChange = vi.fn();
    wrap(
      <Segmented
        aria-label="Device"
        value="desktop"
        onValueChange={onChange}
        options={[
          { value: "desktop", label: "Desktop" },
          { value: "mobile", label: "Phone" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Phone" }));
    expect(onChange).toHaveBeenCalledWith("mobile");
    onChange.mockClear();
    await userEvent.click(screen.getByRole("radio", { name: "Desktop" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("toggles a switch", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onCheckedChange={onChange} aria-label="Show in navigation" />);
    await userEvent.click(screen.getByRole("switch", { name: "Show in navigation" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

const PICKER_TOKENS = [
  { id: "accent", name: "Accent", value: "#6f8461" },
  { id: "ink", name: "Ink", value: "#2e3a2f" },
];

function Picker({ onChange }: { onChange: (v: ColorValue) => void }) {
  const [v, setV] = useState<ColorValue | null>({ kind: "token", token: "accent" });
  return (
    <TooltipProvider>
      <ColorPickerPanel
        tokens={PICKER_TOKENS}
        value={v}
        onChange={(next) => {
          setV(next);
          onChange(next);
        }}
      />
    </TooltipProvider>
  );
}

describe("ColorPickerPanel", () => {
  it("picks site colors first", async () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Accent" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Ink" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "token", token: "ink" });
  });

  it("accepts an exact hex value", async () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Exact" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    expect(hex).toHaveValue("6F8461");
    await userEvent.clear(hex);
    await userEvent.type(hex, "3347e6{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ kind: "exact", hex: "#3347e6" });
  });
});

describe("Dialog", () => {
  it("opens from a trigger, focuses data-autofocus, and closes", async () => {
    wrap(
      <Dialog
        trigger={<Button>Rename</Button>}
        title="Rename page"
        description="Shown in navigation."
      >
        <Input aria-label="Page name" data-autofocus />
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename page" });
    expect(dialog).toHaveAccessibleDescription("Shown in navigation.");
    expect(within(dialog).getByRole("textbox", { name: "Page name" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Menu", () => {
  it("runs the selected item", async () => {
    const onDuplicate = vi.fn();
    wrap(
      <Menu
        trigger={<Button>Actions</Button>}
        items={[
          { label: "Duplicate", shortcut: "mod+d", onSelect: onDuplicate },
          { type: "separator" },
          { label: "Delete", danger: true, disabled: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Delete/ })).toHaveAttribute("data-disabled");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Duplicate/ }));
    expect(onDuplicate).toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  it("switches panels with the keyboard", async () => {
    render(
      <Tabs
        aria-label="Inspector"
        items={[
          { value: "design", label: "Design", content: <p>Spacing panel</p> },
          { value: "page", label: "Page", content: <p>Page settings</p> },
        ]}
      />,
    );
    expect(screen.getByText("Spacing panel")).toBeVisible();
    screen.getByRole("tab", { name: "Design" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Page" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Page settings")).toBeVisible();
  });
});

describe("Toast", () => {
  it("shows toasts pushed from anywhere and runs actions", async () => {
    const onCopy = vi.fn();
    render(<Toaster />);
    act(() => {
      toast({
        tone: "celebrate",
        title: "Your site is live",
        description: "sam.github.io/site",
        action: { label: "Copy link", onClick: onCopy, keepOpen: true },
      });
    });
    expect(await screen.findByText("Your site is live")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(onCopy).toHaveBeenCalled();
    expect(screen.getByText("Your site is live")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await vi.waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(0));
  });

  it("keeps at most four toasts", () => {
    for (let i = 0; i < 6; i++) toast({ title: `T${i}` });
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(["T2", "T3", "T4", "T5"]);
  });
});

function Registers({ run }: { run: () => void }) {
  useRegisterCommands("test", [{ id: "publish", label: "Publish site", group: "Site", run }]);
  return null;
}

describe("CommandPalette", () => {
  it("opens with ⌘K / Ctrl+K, filters and runs a command", async () => {
    const run = vi.fn();
    render(
      <>
        <Registers run={run} />
        <CommandPalette />
      </>,
    );
    await userEvent.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText("Search commands…");
    await userEvent.type(input, "publ");
    expect(screen.getByRole("option", { name: /Publish site/ })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    expect(useCommandStore.getState().open).toBe(false);
  });

  it("unregisters commands when the source unmounts", () => {
    const { unmount } = render(<Registers run={() => undefined} />);
    expect(useCommandStore.getState().sources.test).toHaveLength(1);
    unmount();
    expect(useCommandStore.getState().sources.test).toBeUndefined();
  });
});

describe("Feedback and people", () => {
  it("renders badges, empty states and presence overflow", async () => {
    wrap(
      <>
        <Badge tone="live" dot>
          Live
        </Badge>
        <EmptyState
          title="No form entries yet"
          description="Messages land here."
          action={<Button>Add a form</Button>}
        />
        <AvatarStack
          people={[
            { id: "a", name: "Sam Rivera" },
            { id: "b", name: "Noor Haddad" },
            { id: "c", name: "Ada Okafor" },
            { id: "d", name: "Lee Chen" },
          ]}
          max={2}
        />
      </>,
    );
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No form entries yet" })).toBeInTheDocument();
    const stack = screen.getByRole("list", { name: "People here" });
    expect(within(stack).getAllByRole("listitem")).toHaveLength(3);
    expect(within(stack).getByText("+2")).toBeInTheDocument();
    expect(await within(stack).findByText("SR")).toBeInTheDocument();
  });
});
