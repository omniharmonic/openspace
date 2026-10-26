import "fake-indexeddb/auto";
import { type MediaMeta, MediaMetaSchema, type SiteDocument } from "@openspace/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { TEMPLATE_FIXTURES } from "../../api/fixtures";
import { createMockHub } from "../../api/mock";
import { devSiteDocument } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import { idbQueue, memoryQueue } from "./queue";
import { type FakeImage, fakeCodec, fakePhoto } from "./testing";
import { createUploader, useUploads } from "./uploader";
import { mediaUsage, REPO_BLOCK_BYTES, REPO_WARN_BYTES, sizeLevel } from "./usage";

const SAM = { id: "gh_1001", login: "sam-rivera", name: "Sam Rivera", avatarUrl: null };

async function setup(queue = memoryQueue()) {
  const hub = createMockHub({ user: SAM, buildMs: 0 });
  const tpl = TEMPLATE_FIXTURES[0];
  if (!tpl) throw new Error("no template");
  const site = await hub.createSite({
    template: tpl.id,
    look: tpl.looks[0]?.id ?? "",
    name: "Maya Yoga",
    tagline: "",
  });
  const doc = devSiteDocument({ siteId: site.id, name: site.name, url: site.url });
  const store = createEditorStore({ doc, actor: "user:test" });
  const images = new WeakMap<Blob, FakeImage>();
  const { codec } = fakeCodec(images);
  const events: string[] = [];
  const uploader = createUploader({
    siteId: site.id,
    hub,
    queue,
    codec,
    getDoc: () => store.getState().doc,
    addMedia: (path, meta: MediaMeta) =>
      store.getState().commit([{ op: "media.add", path, meta }], { label: "Add image" }).ok,
    backoff: () => 5,
    now: () => new Date("2026-10-26T12:00:00Z"),
    onEvent: (e) => events.push(`${e.type}:${e.item.name}`),
  });
  return { hub, site, store, images, uploader, events, queue };
}

beforeEach(() => useUploads.setState({ items: [] }));

describe("uploader", () => {
  it("processes, uploads to the Hub and emits a media.add op", async () => {
    const { hub, site, store, images, uploader, events } = await setup();
    const file = fakePhoto(images, { width: 3000, height: 2000 }, "Garden.jpg");
    const [res] = await uploader.add([file]);
    await uploader.idle();
    expect(res?.duplicate).toBe(false);
    const path = res?.path as string;
    const upload = hub.calls.find((c) => c.method === "uploadMedia");
    expect(upload?.args[0]).toBe(site.id);
    expect((upload?.args[2] as { path: string } | undefined)?.path).toBe(path);
    const meta = store.getState().doc.media[path as keyof SiteDocument["media"]];
    expect(meta).toBeDefined();
    expect(MediaMetaSchema.safeParse(meta).success).toBe(true);
    expect(meta?.width).toBe(2400);
    expect(store.getState().undoStack.at(-1)?.label).toBe("Add image");
    expect(useUploads.getState().items[0]?.status).toBe("done");
    expect(events).toEqual(["added:Garden.jpg"]);
  });

  it("dedupes a second identical upload without calling the Hub", async () => {
    const { hub, images, uploader } = await setup();
    await uploader.add([fakePhoto(images, { width: 800, height: 600 }, "a.jpg")]);
    await uploader.idle();
    const before = hub.calls.filter((c) => c.method === "uploadMedia").length;
    const [res] = await uploader.add([fakePhoto(images, { width: 800, height: 600 }, "b.jpg")]);
    await uploader.idle();
    expect(res?.duplicate).toBe(true);
    expect(hub.calls.filter((c) => c.method === "uploadMedia").length).toBe(before);
    expect(useUploads.getState().items.at(-1)?.status).toBe("duplicate");
  });

  it("keeps the file queued and retries when the connection drops", async () => {
    const { hub, store, images, uploader } = await setup();
    hub.manage.failUploads = 2;
    const [res] = await uploader.add([fakePhoto(images, { width: 800, height: 600 })]);
    await new Promise((r) => setTimeout(r, 60));
    await uploader.idle();
    const path = res?.path as keyof SiteDocument["media"];
    expect(hub.calls.filter((c) => c.method === "uploadMedia").length).toBe(3);
    expect(store.getState().doc.media[path]).toBeDefined();
  });

  it("persists the queue in IndexedDB so another session can resume it", async () => {
    const queue = idbQueue(indexedDB);
    const first = await setup(queue);
    first.hub.manage.failUploads = 99;
    const [res] = await first.uploader.add([fakePhoto(first.images, { width: 640, height: 480 })]);
    await first.uploader.idle();
    first.uploader.dispose();
    const pending = await queue.list(first.site.id);
    expect(pending.map((p) => p.path)).toEqual([res?.path]);
    expect(pending[0]?.blob.size).toBeGreaterThan(0);

    // A new session (same site) resumes and finishes the upload.
    first.hub.manage.failUploads = 0;
    const store = first.store;
    const resumed = createUploader({
      siteId: first.site.id,
      hub: first.hub,
      queue,
      getDoc: () => store.getState().doc,
      addMedia: (path, meta) => store.getState().commit([{ op: "media.add", path, meta }]).ok,
    });
    await resumed.resume();
    await resumed.idle();
    expect(store.getState().doc.media[res?.path as keyof SiteDocument["media"]]).toBeDefined();
    expect(await queue.list(first.site.id)).toEqual([]);
  });

  it("blocks uploads when the site's files reach 900 MB", async () => {
    const { store, images, uploader, hub } = await setup();
    const doc = store.getState().doc;
    store.getState().replaceDocument({
      ...doc,
      media: {
        ...doc.media,
        "media/2026/01/huge-aaaaaaaa.mp4": {
          id: "med_0000000000",
          path: "media/2026/01/huge-aaaaaaaa.mp4",
          kind: "video",
          mime: "video/mp4",
          bytes: REPO_BLOCK_BYTES,
          createdAt: "2026-01-01T00:00:00Z",
        },
      } as SiteDocument["media"],
    });
    const [res] = await uploader.add([fakePhoto(images, { width: 800, height: 600 })]);
    expect(res).toBeNull();
    expect(useUploads.getState().items.at(-1)?.status).toBe("failed");
    expect(useUploads.getState().items.at(-1)?.message).toMatch(/Cloudflare/);
    expect(hub.calls.some((c) => c.method === "uploadMedia")).toBe(false);
  });

  it("reports size levels and where a file is used", async () => {
    expect(sizeLevel(REPO_WARN_BYTES - 1)).toBe("ok");
    expect(sizeLevel(REPO_WARN_BYTES)).toBe("warn");
    expect(sizeLevel(REPO_BLOCK_BYTES)).toBe("block");
    const { store } = await setup();
    const doc = store.getState().doc;
    const [path] = Object.keys(doc.media);
    if (path) {
      const withLogo = { ...doc, site: { ...doc.site, logo: { src: path, alt: "Logo" } } };
      expect(mediaUsage(withLogo as SiteDocument, path).map((u) => u.label)).toContain("Site logo");
    }
  });
});
