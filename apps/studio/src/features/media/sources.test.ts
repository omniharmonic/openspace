import { afterEach, describe, expect, it, vi } from "vitest";
import {
  draftMediaRemote,
  mediaFetchInit,
  previewUrl,
  readMediaBytes,
  useMediaSources,
} from "./sources";

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

  it("uses the Hub proxy only for dev-emulated or private site files", () => {
    const base = "http://hub.test/api/sites/st_0000000000/";
    expect(draftMediaRemote({ emulated: false, isPrivate: false, base })).toBeNull();
    expect(draftMediaRemote({ emulated: true, isPrivate: false, base })).toBe(base);
    expect(draftMediaRemote({ emulated: false, isPrivate: true, base })).toBe(base);
    expect(draftMediaRemote({ emulated: true, isPrivate: false, base: null })).toBeNull();
  });

  it("leaving a site revokes its object URLs and forgets the bytes", async () => {
    const revoke = vi.fn();
    const urls = URL as unknown as Record<string, unknown>;
    const saved = { create: urls.createObjectURL, revoke: urls.revokeObjectURL };
    urls.createObjectURL = () => "blob:local-1";
    urls.revokeObjectURL = revoke;
    useMediaSources.getState().addLocal("media/a.png", new Blob([new Uint8Array([1, 2, 3])]));
    expect(await readMediaBytes("media/a.png")).toEqual(new Uint8Array([1, 2, 3]));
    useMediaSources.getState().reset();
    expect(revoke).toHaveBeenCalledWith("blob:local-1");
    expect(useMediaSources.getState().local).toEqual({});
    expect(await readMediaBytes("media/a.png")).toBeNull();
    urls.createObjectURL = saved.create;
    urls.revokeObjectURL = saved.revoke;
  });
});
