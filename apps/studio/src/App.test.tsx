import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("Studio App", () => {
  it("renders the shell title", () => {
    expect(renderToString(<App />)).toContain("OpenSpace Studio");
  });
});
