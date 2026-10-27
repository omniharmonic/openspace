import { describe, expect, it } from "vitest";
import {
  buildErrorByCode,
  buildErrorDetail,
  parseCheckLog,
  translateBuildError,
} from "../src/services/build-errors";

/** The live test's failure, exactly as reported. */
const LINES = [
  "content/pages/home.json error link sections.0.blocks.1.fields.link: Link to /book does not lead to any page",
  "content/pages/home.json error link sections.0.blocks.1.fields.secondaryLink: Link to /retreats does not lead to any page",
];

/** The same failure as a raw Actions job log (timestamps, annotations, then the report). */
const RAW_LOG = [
  "2026-10-27T09:14:02.0000000Z ##[group]Run npx openspace check --ci",
  "2026-10-27T09:14:02.0000000Z npx openspace check --ci",
  "2026-10-27T09:14:02.0000000Z ##[endgroup]",
  ...LINES.map((l) => `2026-10-27T09:14:05.1000000Z ##[error]${l}`),
  '2026-10-27T09:14:05.1000000Z ##[warning]Page "Members" is members-only: it is only published with Cloudflare hosting.',
  "2026-10-27T09:14:05.2000000Z content/pages/home.json",
  "2026-10-27T09:14:05.2000000Z   error   link     sections.0.blocks.1.fields.link: Link to /book does not lead to any page",
  "2026-10-27T09:14:05.2000000Z   error   link     sections.0.blocks.1.fields.secondaryLink: Link to /retreats does not lead to any page",
  "2026-10-27T09:14:05.2000000Z ",
  "2026-10-27T09:14:05.2000000Z content/pages/members.json",
  '2026-10-27T09:14:05.2000000Z   warning gating   access: Page "Members" is members-only: it is only published with Cloudflare hosting.',
  "2026-10-27T09:14:05.2000000Z ",
  "2026-10-27T09:14:05.2000000Z FAILED: 2 errors, 1 warning.",
  "2026-10-27T09:14:05.3000000Z ##[error]Process completed with exit code 1.",
].join("\n");

const names = {
  pageTitle: (file: string) => (file === "content/pages/home.json" ? "Home" : undefined),
  blockLabel: (file: string, path: string) =>
    file === "content/pages/home.json" && path.startsWith("sections.0.blocks.1.")
      ? "Button"
      : undefined,
};

describe("build errors from `openspace check` logs", () => {
  it("reads the live test's ##[error] lines as two link findings", () => {
    for (const log of [LINES.join("\n"), LINES.map((l) => `##[error]${l}`).join("\n"), RAW_LOG])
      expect(parseCheckLog(log)).toEqual([
        {
          file: "content/pages/home.json",
          rule: "link",
          path: "sections.0.blocks.1.fields.link",
          message: "Link to /book does not lead to any page",
        },
        {
          file: "content/pages/home.json",
          rule: "link",
          path: "sections.0.blocks.1.fields.secondaryLink",
          message: "Link to /retreats does not lead to any page",
        },
      ]);
  });

  it("says which link on which page leads nowhere, not 'couldn't be read'", () => {
    const e = translateBuildError({
      conclusion: "failure",
      steps: ["build: Check site"],
      log: RAW_LOG,
      text: "Edited Home",
      names,
    });
    expect(e.code).toBe("broken_link");
    expect(e.title).toBe("Some links lead to pages that don't exist");
    expect(e.message).toContain(
      "A button on Home links to /book, which isn't a page on your site.",
    );
    expect(e.message).toContain(
      "A button on Home links to /retreats, which isn't a page on your site.",
    );
    expect(e.message).not.toMatch(/couldn't be read|shape the site understands/);
    expect(e.message).not.toMatch(/\b(repository|commit|branch|build|deploy|workflow)\b/i);
    expect(e.fix).toBe("revert");
    // Without the site's names, file names still say where.
    const plain = translateBuildError({ steps: ["build: Check site"], text: LINES[0] });
    expect(plain).toMatchObject({
      code: "broken_link",
      title: "A link leads to a page that doesn't exist",
    });
    expect(plain.message).toContain(
      "A link on Home links to /book, which isn't a page on your site.",
    );
  });

  it("keeps the specific copy with the publish (stored detail → versions list)", () => {
    const e = translateBuildError({ log: RAW_LOG, names });
    const detail = buildErrorDetail(e);
    expect(detail).not.toBeNull();
    expect(buildErrorByCode("broken_link", detail)).toEqual(e);
    // Older rows without detail still get sensible copy.
    expect(buildErrorByCode("broken_link", null)?.title).toMatch(/link/);
    expect(buildErrorDetail(translateBuildError({ steps: ["build: Run npm ci"] }))).toBeNull();
  });

  it("other check rules map to their own copy; warnings (members-only pages) never count", () => {
    expect(
      translateBuildError({
        log: "##[error]Image media/2026/hero.jpg does not exist in media/",
      }).code,
    ).toBe("missing_image");
    expect(
      translateBuildError({
        log: "content/site.json\n  error   schema   title: Too big: expected string to have <=120 characters",
      }).code,
    ).toBe("content_invalid");
    // A run that only warned about the members page and then failed elsewhere isn't a link or
    // content problem (and echoed commands like "npx openspace check" don't count).
    const warnedOnly = [
      "Run npx openspace check --ci",
      '##[warning]Page "Members" is members-only: it is only published with Cloudflare hosting.',
      "content/pages/members.json",
      '  warning gating   access: Page "Members" is members-only: it is only published with Cloudflare hosting.',
      "OK: 1 warning, no errors.",
      "##[error]Get Pages site failed. Please verify that the repository has Pages enabled",
    ].join("\n");
    expect(parseCheckLog(warnedOnly)).toEqual([]);
    expect(translateBuildError({ steps: ["deploy: Setup Pages"], log: warnedOnly }).code).toBe(
      "pages_off",
    );
  });
});
