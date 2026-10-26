import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorUi } from "../editor/editor-store";
import { FORBIDDEN, openWorkspace, visibleCopy } from "../workspace/testing";

beforeEach(() => useEditorUi.getState().reset());

describe("analytics", () => {
  it("shows totals, a visits chart with a tooltip and a table view, and breakdowns", async () => {
    const { user, hub } = await openWorkspace("analytics");
    expect(await screen.findByText("Visits")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "getAnalytics")?.args[1]).toEqual({ range: "month" });
    const chart = screen.getByRole("img", { name: /Visits per day: 30 days/ });
    fireEvent.pointerMove(chart, { clientX: 300, clientY: 100 });
    await waitFor(() =>
      expect(document.querySelector(".st-viz__tip")?.textContent).toMatch(/\d+ visits/),
    );
    await user.click(screen.getByRole("button", { name: "Show as table" }));
    const table = screen
      .getByRole("columnheader", { name: "Pages viewed" })
      .closest("table") as HTMLElement;
    expect(within(table).getAllByRole("row")).toHaveLength(31);
    expect(
      within(screen.getByRole("list", { name: "Top pages" })).getByText("/classes"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Devices" })).getByText("Phone"),
    ).toBeInTheDocument();
    expect(screen.getByText("Contact form")).toBeInTheDocument();
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
  });

  it("switches date ranges, including a custom one", async () => {
    const { user, hub } = await openWorkspace("analytics");
    await screen.findByText("Visits");
    await user.click(screen.getByRole("radio", { name: "7 days" }));
    await waitFor(() =>
      expect(hub.calls.filter((c) => c.method === "getAnalytics").at(-1)?.args[1]).toEqual({
        range: "week",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Custom" }));
    const from = screen.getByLabelText("From");
    fireEvent.change(from, { target: { value: "2026-10-01" } });
    await waitFor(() =>
      expect(hub.calls.filter((c) => c.method === "getAnalytics").at(-1)?.args[1]).toMatchObject({
        from: "2026-10-01",
      }),
    );
    expect(await screen.findByRole("img", { name: /Visits per day/ })).toBeInTheDocument();
  });
});
