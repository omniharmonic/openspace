import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster } from "../ui";
import { useToastStore } from "../ui/toast-store";
import { PwaNotices } from "./PwaUi";
import { usePwa } from "./register";

afterEach(() => {
  usePwa.setState({ offlineReady: false });
  useToastStore.getState().clear();
  localStorage.clear();
});

const mount = () =>
  render(
    <>
      <PwaNotices />
      <Toaster />
    </>,
  );

describe("'works offline now'", () => {
  it("is said once per install, not on every load", () => {
    const first = mount();
    act(() => usePwa.setState({ offlineReady: true }));
    expect(screen.getByText("OpenSpace works offline now")).toBeInTheDocument();
    first.unmount();
    act(() => {
      useToastStore.getState().clear();
      usePwa.setState({ offlineReady: false });
    });
    // The next load: the service worker reports ready again, but it's already been said.
    mount();
    act(() => usePwa.setState({ offlineReady: true }));
    expect(screen.queryByText("OpenSpace works offline now")).not.toBeInTheDocument();
  });
});
