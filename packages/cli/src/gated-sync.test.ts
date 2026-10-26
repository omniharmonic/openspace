import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { gatedBucketName, runGatedSync, sealedStubs } from "./gated-sync";
import { captureIo } from "./io";
import { cleanup, cli, editJson, meadowCopy } from "./test-helpers";

afterAll(cleanup);

const stub = {
  id: "pg_gatedpage1",
  title: "Library",
  slug: "members/library",
  access: { members: true },
  seo: { noindex: true },
  contentRef: "abcdef0123456789abcdef0123456789abcdef01",
  sections: [],
};

async function cloudflareSite() {
  const dir = await meadowCopy();
  await editJson(join(dir, "openspace.json"), (c) => {
    c.deploy.target = "cloudflare";
    c.hub = "https://hub.example";
  });
  await writeFile(
    join(dir, "wrangler.jsonc"),
    `{
  // comment
  "name": "meadow",
  "r2_buckets": [{ "binding": "OS_GATED", "bucket_name": "meadow-gated" }],
}
`,
  );
  await mkdir(join(dir, "content/pages/members"), { recursive: true });
  await writeFile(join(dir, "content/pages/members/library.json"), JSON.stringify(stub));
  return dir;
}

describe("openspace gated-sync", () => {
  it("does nothing for sites without sealed pages", async () => {
    const dir = await meadowCopy();
    const { io, text } = captureIo(dir);
    expect(await runGatedSync(io)).toEqual({ uploaded: 0, bucket: null });
    expect(text()).toContain("No members-only or password pages");
  });

  it("downloads the commit's versions with the run's OIDC token and puts them into R2", async () => {
    const dir = await cloudflareSite();
    expect(await sealedStubs(dir)).toEqual([{ id: stub.id, ref: stub.contentRef }]);
    expect(gatedBucketName(dir)).toBe("meadow-gated");
    const requests: Array<{ url: string; auth: string | null }> = [];
    const fetch = async (url: string, init?: RequestInit) => {
      requests.push({ url, auth: new Headers(init?.headers).get("authorization") });
      if (url.startsWith("https://actions.example/token"))
        return Response.json({ value: "oidc-token" });
      if (url === "https://hub.example/ci/sites/st_meadw00001/gated")
        return Response.json({
          pages: [{ id: stub.id, ref: stub.contentRef, page: { ...stub, sections: [1] } }],
        });
      return new Response("no", { status: 404 });
    };
    const calls: string[][] = [];
    let uploaded = "";
    const wrangler = async (args: string[]) => {
      calls.push(args);
      const file = args[args.indexOf("--file") + 1];
      if (args[1] === "object" && file) uploaded = await readFile(file, "utf8");
      return args[1] === "bucket" ? 1 : 0; // the bucket already exists
    };
    const { io, text } = captureIo(dir, {
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example/token?api-version=2.0",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner-token",
    });
    expect(await runGatedSync(io, {}, { fetch, wrangler })).toEqual({
      uploaded: 1,
      bucket: "meadow-gated",
    });
    expect(requests[0]?.url).toBe(
      "https://actions.example/token?api-version=2.0&audience=https%3A%2F%2Fhub.example",
    );
    expect(requests[0]?.auth).toBe("Bearer runner-token");
    expect(requests[1]?.auth).toBe("Bearer oidc-token");
    expect(calls[1]?.slice(0, 4)).toEqual([
      "r2",
      "object",
      "put",
      `meadow-gated/pages/${stub.id}/${stub.contentRef}.json`,
    ]);
    expect(calls[1]).toContain("--remote");
    expect(JSON.parse(uploaded).sections).toEqual([1]);
    expect(text()).toContain("Uploaded 1 private page(s)");
  });

  it("fails the publish when it can't get every version (never deploys without them)", async () => {
    const dir = await cloudflareSite();
    const env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.example/token",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "t",
    };
    const fetch = async (url: string) =>
      url.startsWith("https://actions.example")
        ? Response.json({ value: "oidc" })
        : Response.json({ pages: [] });
    await expect(
      runGatedSync(captureIo(dir, env).io, {}, { fetch, wrangler: async () => 0 }),
    ).rejects.toThrow(/missing private page content/);
    await expect(runGatedSync(captureIo(dir).io, {}, { fetch })).rejects.toThrow(/id-token/);
  });

  it("sealed stubs pass `openspace check`", async () => {
    const dir = await cloudflareSite();
    const r = await cli(dir, ["check", "--json"]);
    const report = JSON.parse(r.out) as { ok: boolean; issues?: Array<{ message: string }> };
    expect(report.ok, r.out.slice(0, 2000)).toBe(true);
  });
});
