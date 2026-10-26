import { env } from "cloudflare:test";
import type { Page, SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { DevGitHubAccess } from "../src/github/dev";
import { unwrapRoom } from "../src/room";
import {
  gatedBundle,
  gatedKey,
  openFiles,
  sealChanges,
  sealPageText,
} from "../src/services/gated-content";
import { RegistryTemplateSource } from "../src/services/templates";
import { basicTemplate } from "../src/templates/basic";
import { call, devLogin } from "./helpers";
import { createSite, op, para, room, runFlushAlarm, setText, T } from "./room-helpers";

const SECRET_TEXT = "Members-only breathing plan";
const gatedPage = (over: Partial<Page> = {}): Page => ({
  id: "pg_gatedpage1",
  title: "Library",
  slug: "members/library",
  access: { members: true },
  sections: [
    {
      id: "sec_gatedsec01",
      layout: { mode: "stack", columns: { d: [12] } },
      style: {},
      blocks: [
        { id: "blk_gatedbk001", type: "text", v: 1, fields: { content: para(SECRET_TEXT) } },
      ],
    },
  ] as Page["sections"],
  ...over,
});

const ctx = (siteId = "st_gatedtest1") => ({
  store: env.UPLOADS,
  siteId,
  hmacKey: "test-hmac-key",
});

/** Every text file of a branch, joined: what anyone can read in a public repository. */
async function repoText(repo: { owner: string; name: string }, ref: string): Promise<string> {
  const gh = new DevGitHubAccess(env.HUB_DB);
  const files = await gh.readFiles(repo, ref, { textOnly: true });
  return Object.values(files).join("\n");
}

describe("sealing gated pages", () => {
  it("replaces gated page files with content-free stubs and opens them again", async () => {
    const text = `${JSON.stringify(gatedPage(), null, 2)}\n`;
    const sealed = await sealPageText(ctx(), text);
    expect(sealed).not.toContain(SECRET_TEXT);
    const stub = JSON.parse(sealed) as Page;
    expect(stub).toMatchObject({
      id: "pg_gatedpage1",
      title: "Library",
      slug: "members/library",
      access: { members: true },
      sections: [],
      seo: { noindex: true },
    });
    expect(stub.contentRef).toMatch(/^[a-z0-9]{40}$/);
    // Content-addressed: the same content seals to the same stub; sealing a stub is a no-op.
    expect(await sealPageText(ctx(), text)).toBe(sealed);
    expect(await sealPageText(ctx(), sealed)).toBe(sealed);
    expect(await env.UPLOADS.head(gatedKey("st_gatedtest1", stub.contentRef as string))).not.toBe(
      null,
    );
    const opened = await openFiles(ctx(), { "content/pages/members/library.json": sealed });
    expect(opened["content/pages/members/library.json"]).toBe(text);
    // Another site can't open it.
    const foreign = await openFiles(ctx("st_othersite1"), {
      "content/pages/members/library.json": sealed,
    });
    expect(foreign["content/pages/members/library.json"]).toBe(sealed);
  });

  it("leaves public pages, deletions and binary files alone", async () => {
    const pub = `${JSON.stringify({ ...gatedPage(), access: undefined, slug: "about" }, null, 2)}\n`;
    const out = await sealChanges(ctx(), [
      { path: "content/pages/about.json", content: pub },
      { path: "content/pages/old.json", content: null },
      { path: "media/a.png", content: "AAAA", encoding: "base64" },
    ]);
    expect(out[0]?.content).toBe(pub);
    expect(out[1]?.content).toBeNull();
    expect(out[2]?.content).toBe("AAAA");
  });

  it("password pages are sealed too", async () => {
    const sealed = await sealPageText(
      ctx(),
      JSON.stringify(gatedPage({ slug: "teachers", access: { password: true } })),
    );
    expect(sealed).not.toContain(SECRET_TEXT);
    expect(JSON.parse(sealed).contentRef).toBeTruthy();
  });
});

describe("the repository never contains gated content", () => {
  it("draft flushes and publishes commit stubs; the room, MCP document and history keep the content", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Maya Lin");
    const site = await createSite(app, owner, "Gated Site");
    const repo = { owner: "maya-lin", name: "gated-site" };
    const res = await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: owner,
      json: { ops: [op({ op: "page.create", page: gatedPage() })] },
    });
    expect(res.status).toBe(200);
    expect(await runFlushAlarm(site.id)).toBe(true);
    const draft = await repoText(repo, "os/draft");
    expect(draft).toContain('"contentRef"');
    expect(draft).not.toContain(SECRET_TEXT);

    // A second edit elsewhere doesn't rewrite the unchanged gated stub.
    const gh = new DevGitHubAccess(env.HUB_DB);
    const stubBefore = (await gh.readFiles(repo, "os/draft", { textOnly: true }))[
      "content/pages/members/library.json"
    ];
    await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: owner,
      json: {
        ops: [setText(T.heroTitle, "Welcome back")],
      },
    });
    await unwrapRoom(room(site.id).flush(site.id));
    const stubAfter = (await gh.readFiles(repo, "os/draft", { textOnly: true }))[
      "content/pages/members/library.json"
    ];
    expect(JSON.parse(stubAfter ?? "{}").contentRef).toBe(
      JSON.parse(stubBefore ?? "{}").contentRef,
    );

    const pub = await call(app, `/api/sites/${site.id}/publish`, { method: "POST", cookie: owner });
    expect(pub.status).toBe(200);
    expect(await repoText(repo, "main")).not.toContain(SECRET_TEXT);

    // Hub readers open the stubs again.
    const doc = (await (
      await call(app, `/api/sites/${site.id}/document?ref=published`, { cookie: owner })
    ).json()) as { document: SiteDocument };
    expect(JSON.stringify(doc.document.pages)).toContain(SECRET_TEXT);
    const live = (await (
      await call(app, `/api/sites/${site.id}/room/document`, { cookie: owner })
    ).json()) as { document: SiteDocument };
    expect(JSON.stringify(live.document)).toContain(SECRET_TEXT);
    expect(JSON.stringify(live.document)).not.toContain("contentRef");

    // The publish workflow's bundle: exactly the versions main names.
    const main = (await gh.getRef(repo, "main")) as string;
    const bundle = await gatedBundle({ store: env.UPLOADS, siteId: site.id }, gh, repo, main);
    expect(bundle.missing).toEqual([]);
    expect(bundle.pages).toHaveLength(1);
    expect(bundle.pages[0]).toMatchObject({ id: "pg_gatedpage1", slug: "members/library" });
    expect(JSON.stringify(bundle.pages[0]?.page)).toContain(SECRET_TEXT);
  });

  it("sites created from a template with gated pages start without their content in the repo", async () => {
    const tpl = {
      ...basicTemplate,
      meta: { ...basicTemplate.meta, id: "gated-basic" },
      files: {
        ...basicTemplate.files,
        "content/pages/members/library.json": `${JSON.stringify(gatedPage(), null, 2)}\n`,
      },
    };
    const app = createApp({ services: { templates: new RegistryTemplateSource([tpl]) } });
    const owner = await devLogin(app, "Ana Ruiz");
    const res = await call(app, "/api/sites", {
      method: "POST",
      cookie: owner,
      json: { template: "gated-basic", name: "Gated Template" },
    });
    expect(res.status).toBe(201);
    const site = (await res.json()) as { id: string };
    const repo = { owner: "ana-ruiz", name: "gated-template" };
    expect(await repoText(repo, "main")).not.toContain(SECRET_TEXT);
    expect(await repoText(repo, "os/draft")).not.toContain(SECRET_TEXT);
    const live = (await (
      await call(app, `/api/sites/${site.id}/room/document`, { cookie: owner })
    ).json()) as { document: SiteDocument };
    expect(JSON.stringify(live.document)).toContain(SECRET_TEXT);
  });
});
