import { apply, type Op } from "@openspace/ops";
import { describe, expect, it } from "vitest";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { describeChanges } from "./changes";
import { snapshotLabel } from "./HistoryPanel";
import { pageList } from "./session";

const op = (body: Record<string, unknown>, n: number) =>
  ({ ...body, id: `t${n}`, actor: "user:t", ts: n }) as unknown as Op;

describe("publish change summary", () => {
  it("counts pages edited in plain words", () => {
    const live = devSiteDocument();
    let draft = apply(
      live,
      op({ op: "block.update", page: I.home, block: I.heroButton, set: { label: "Book" } }, 1),
    );
    let s = describeChanges(live, draft);
    expect(s.lines).toEqual(["1 page edited"]);
    expect(s.sentence).toBe("Edited Home");
    draft = apply(draft, op({ op: "page.update", page: I.about, set: { title: "Our story" } }, 2));
    s = describeChanges(live, draft);
    expect(s.lines).toEqual(["2 pages edited"]);
    expect(s.empty).toBe(false);
  });

  it("is empty when the draft matches the live site", () => {
    const live = devSiteDocument();
    expect(describeChanges(live, structuredClone(live))).toMatchObject({ empty: true, lines: [] });
  });

  it("names pages and snapshots for people", () => {
    const doc = devSiteDocument();
    expect(pageList(doc, [I.home])).toBe("Home");
    expect(pageList(doc, [I.home, I.about])).toBe("Home and About");
    expect(pageList(doc, [])).toBe("your site");
    const snap = { tag: "t", sha: "s", date: null, automatic: true };
    expect(snapshotLabel({ ...snap, name: "agent-1761000000000" })).toBe("Before an AI session");
    expect(snapshotLabel({ ...snap, name: "before-rollback-1761000000000" })).toBe(
      "Before a rollback",
    );
    expect(snapshotLabel({ ...snap, name: "spring-launch", automatic: false })).toBe(
      "Spring launch",
    );
  });
});
