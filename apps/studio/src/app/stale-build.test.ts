import { describe, expect, it } from "vitest";
import { claimStaleReload, isStaleBuildError, RELOAD_WINDOW_MS } from "./stale-build";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe("stale build after a deploy", () => {
  it("recognises each browser's failed lazy load, and nothing else", () => {
    expect(
      isStaleBuildError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://studio.openspace.host/assets/SiteChromePanel-0PxOXfU9.js",
        ),
      ),
    ).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildError(new Error("error loading dynamically imported module: x.js"))).toBe(
      true,
    );
    expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleBuildError(undefined)).toBe(false);
  });

  it("reloads once, then shows the Reload screen instead of looping", () => {
    const s = memory();
    expect(claimStaleReload(s, 1_000)).toBe(true);
    expect(claimStaleReload(s, 1_000 + RELOAD_WINDOW_MS - 1)).toBe(false);
    expect(claimStaleReload(s, 1_000 + RELOAD_WINDOW_MS)).toBe(true);
    expect(claimStaleReload(null)).toBe(true);
  });
});
