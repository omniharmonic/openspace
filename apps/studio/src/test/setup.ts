import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom lacks a few browser APIs that Radix primitives and our scrub input rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

const proto = Element.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
proto.scrollIntoView ??= () => {};

/** jsdom has no layout: give Ranges empty rects so ProseMirror can measure (any window). */
export function patchLayoutApis(win: Window & typeof globalThis) {
  const range = win.Range?.prototype as unknown as Record<string, unknown> | undefined;
  if (!range) return;
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  range.getClientRects ??= () => [];
  range.getBoundingClientRect ??= rect;
  const el = win.Element?.prototype as unknown as Record<string, unknown> | undefined;
  if (el) el.scrollIntoView ??= () => {};
}
patchLayoutApis(window);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
