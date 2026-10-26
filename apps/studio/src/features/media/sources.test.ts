import { afterEach, describe, expect, it } from "vitest";
import { mediaFetchInit, previewUrl, useMediaSources } from "./sources";

describe("media sources", () => {
  afterEach(() => useMediaSources.getState().reset());

  it("prefers this session's copy, then the Hub's draft media proxy, then the public files", () => {
    const base = { repo: "maya/fernwood", branch: "os/draft", local: {} };
    expect(previewUrl("media/a.jpg", base)).toBe(
      "https://raw.githubusercontent.com/maya/fernwood/os/draft/media/a.jpg",
    );
    const remote = "http://hub.test/api/sites/st_0000000000/";
    expect(previewUrl("media/a.jpg", { ...base, remote })).toBe(`${remote}media/a.jpg`);
    expect(previewUrl("media/a.jpg", { ...base, remote, local: { "media/a.jpg": "blob:x" } })).toBe(
      "blob:x",
    );
    expect(previewUrl("https://images.example/a.jpg", { ...base, remote })).toBe(
      "https://images.example/a.jpg",
    );
  });

  it("sends the session cookie only to the Hub proxy", () => {
    useMediaSources.getState().setRemote("http://hub.test/api/sites/st_0000000000/");
    expect(mediaFetchInit("http://hub.test/api/sites/st_0000000000/media/a.jpg")).toEqual({
      credentials: "include",
    });
    expect(mediaFetchInit("https://raw.githubusercontent.com/x/y/os/draft/media/a.jpg")).toEqual(
      {},
    );
  });
});
