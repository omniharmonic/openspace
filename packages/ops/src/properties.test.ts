import type { SiteDocument } from "@openspace/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildOp, type Choice, choiceArb, idFrom, stampOp } from "./__fixtures__/arbitrary";
import { siteFixture } from "./__fixtures__/site";
import { apply, applyAll } from "./apply";
import { diff } from "./diff";
import { invert } from "./invert";
import type { Op } from "./ops";
import { deepEqual } from "./paths";
import { independent, rebase } from "./rebase";
import { validate, validateDocument } from "./validate";

const RUNS = Number(process.env.OPS_PROPERTY_RUNS ?? 300);

/** Run choices against a document, keeping the valid ops. */
function evolve(start: SiteDocument, choices: Choice[], actor = "ana", ts = 1000) {
  let doc = start;
  const ops: Op[] = [];
  const docs: SiteDocument[] = [doc];
  for (const c of choices) {
    const body = buildOp(doc, c);
    if (!body) continue;
    const op = stampOp(body, actor, ts + ops.length);
    const r = validate(doc, op);
    if (!r.ok) continue;
    ops.push(op);
    doc = r.doc;
    docs.push(doc);
  }
  return { doc, ops, docs };
}

const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("properties", () => {
  it("apply ∘ invert = identity, for every valid op (and the inverse is valid and JSON-safe)", () => {
    fc.assert(
      fc.property(fc.array(choiceArb, { minLength: 1, maxLength: 25 }), (choices) => {
        let doc = siteFixture();
        for (const c of choices) {
          const body = buildOp(doc, c);
          if (!body) continue;
          const op = json(stampOp(body));
          const r = validate(doc, op);
          if (!r.ok) continue;
          const inv = invert(doc, op);
          expect(json(inv)).toEqual(inv);
          const back = validate(r.doc, inv);
          if (!back.ok)
            throw new Error(`inverse invalid for ${op.op}: ${JSON.stringify(back.errors)}`);
          expect(deepEqual(back.doc, doc)).toBe(true);
          expect(deepEqual(apply(r.doc, inv), doc)).toBe(true);
          doc = r.doc;
        }
        expect(validateDocument(doc).ok).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("valid ops keep the whole document valid", () => {
    fc.assert(
      fc.property(fc.array(choiceArb, { minLength: 1, maxLength: 30 }), (choices) => {
        const { doc } = evolve(siteFixture(), choices);
        const r = validateDocument(doc);
        if (!r.ok) throw new Error(JSON.stringify(r.errors));
      }),
      { numRuns: RUNS },
    );
  });

  it("ops on distinct ids commute", () => {
    fc.assert(
      fc.property(fc.array(choiceArb, { maxLength: 8 }), choiceArb, choiceArb, (prefix, ca, cb) => {
        const { doc } = evolve(siteFixture(), prefix);
        const a = buildOp(doc, ca);
        const b = buildOp(doc, { ...cb, n: cb.n + 50_000 });
        if (!a || !b) return;
        const opA = stampOp(a, "ana", 1);
        const opB = stampOp(b, "ben", 2);
        if (!independent(opA, opB, doc)) return;
        const ra = validate(doc, opA);
        const rb = validate(doc, opB);
        if (!ra.ok || !rb.ok) return;
        const ab = validate(ra.doc, opB);
        const ba = validate(rb.doc, opA);
        if (!ab.ok || !ba.ok) return; // e.g. two new pages claiming the same slug
        expect(deepEqual(ab.doc, ba.doc)).toBe(true);
      }),
      { numRuns: RUNS * 2 },
    );
  });

  it("validate rejects dangling references", () => {
    fc.assert(
      fc.property(fc.nat(100000), fc.constantFrom(0, 1, 2, 3, 4, 5), (n, which) => {
        const doc = siteFixture();
        const ghostPage = idFrom("pg", n);
        const ghostBlock = idFrom("blk", n);
        const ghostSection = idFrom("sec", n);
        const home = Object.keys(doc.pages)[0] as keyof SiteDocument["pages"];
        const bodies = [
          { op: "block.update", page: home, block: ghostBlock, set: { caption: "x" } },
          { op: "block.delete", page: ghostPage, block: ghostBlock },
          { op: "section.move", page: home, section: ghostSection, at: 0 },
          { op: "nav.update", tree: [...doc.site.nav, { type: "page", page: ghostPage }] },
          { op: "page.delete", page: home }, // navigation still links to it
          {
            op: "block.insert",
            page: home,
            section: ghostSection,
            at: 0,
            block: { id: ghostBlock, type: "text", v: 1, fields: {} },
          },
        ] as const;
        const r = validate(doc, stampOp(bodies[which] as never));
        expect(r.ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("diff(before, after) replays to after", () => {
    fc.assert(
      fc.property(fc.array(choiceArb, { minLength: 1, maxLength: 30 }), (choices) => {
        const before = siteFixture();
        const { doc: after } = evolve(before, choices);
        const ops = diff(before, after);
        expect(json(ops)).toEqual(ops);
        expect(deepEqual(applyAll(before, ops), after)).toBe(true);
        expect(diff(after, after)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it("diff ops are individually valid for ordinary edits", () => {
    fc.assert(
      fc.property(fc.array(choiceArb, { minLength: 1, maxLength: 20 }), (choices) => {
        const before = siteFixture();
        const { doc: after } = evolve(before, choices);
        let cur = before;
        for (const op of diff(before, after)) {
          const r = validate(cur, op);
          if (!r.ok) throw new Error(`${op.op}: ${JSON.stringify(r.errors)}`);
          cur = r.doc;
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("rebase yields ops that apply after the remote ops, and keeps independent ops intact", () => {
    fc.assert(
      fc.property(
        fc.array(choiceArb, { maxLength: 6 }),
        fc.array(choiceArb, { minLength: 1, maxLength: 6 }),
        fc.array(choiceArb, { minLength: 1, maxLength: 6 }),
        fc.boolean(),
        (prefix, localChoices, remoteChoices, localLater) => {
          const base = evolve(siteFixture(), prefix).doc;
          const local = evolve(base, localChoices, "ana", localLater ? 2000 : 1000);
          const remote = evolve(
            base,
            remoteChoices.map((c) => ({ ...c, n: c.n + 70_000 })),
            "ben",
            1500,
          );
          const merged = remote.doc;
          const r = rebase(local.ops, remote.ops, { doc: merged });
          let cur = merged;
          for (const op of r.ops) {
            const v = validate(cur, op);
            if (!v.ok) throw new Error(`${op.op}: ${JSON.stringify(v.errors)}`);
            cur = v.doc;
          }
          // Local ops independent of every remote op survive unchanged (without the doc pass).
          const plain = rebase(local.ops, remote.ops);
          for (const op of local.ops)
            if (remote.ops.every((ro) => independent(op, ro))) expect(plain.ops).toContain(op);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
