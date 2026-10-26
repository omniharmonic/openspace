import { formBlock } from "@openspace/blocks";
import {
  FORBIDDEN_FORM_FIELD_TYPES,
  FORM_FIELD_TYPES,
  type Form,
  FormSchema,
  type ListFieldMeta,
  type Section,
  type StackLayout,
} from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { devSiteDocument, DEV_IDS as I } from "../../editor/model/dev-site";
import { checkEmbed } from "../fields/reference";
import { moveItem, newListItem } from "./defaults";
import { normaliseOrder, setStackColumns, stackColumnsOps, withStackOrder } from "./edits";
import {
  changeFieldType,
  formIssues,
  isForbiddenText,
  newFormField,
  snakeName,
  uniqueName,
} from "./form";
import { checkLink, describeLink, guessLink, normaliseUrl } from "./link";
import { asRole, capabilities } from "./permissions";
import { clearAt, overriddenBps, readAt, setAt } from "./responsive";

describe("role capabilities", () => {
  it("gives the exact-value escape hatch to designers and owners only", () => {
    expect(capabilities("owner").exact).toBe(true);
    expect(capabilities("designer").exact).toBe(true);
    expect(capabilities("editor").exact).toBe(false);
    expect(capabilities("contributor").exact).toBe(false);
  });

  it("mirrors the Hub's editor rules: no site styles or section design; locked sections are words and images only", () => {
    const open = capabilities("editor", { locked: false });
    expect(open.siteStyles).toBe(false);
    expect(open.sectionDesign).toBe(false);
    expect(open.blockDesign).toBe(true);
    expect(open.field("list")).toBe(true);
    const locked = capabilities("editor", { locked: true });
    expect(locked.blockDesign).toBe(false);
    expect(locked.field("text")).toBe(true);
    expect(locked.field("image")).toBe(true);
    expect(locked.field("link")).toBe(false);
    expect(locked.structure).toBe(false);
    expect(capabilities("contributor").field("text")).toBe(false);
  });

  it("treats unknown roles as least privilege", () => {
    expect(asRole(undefined)).toBe("contributor");
    expect(asRole("admin")).toBe("contributor");
    expect(asRole("designer")).toBe("designer");
  });
});

describe("per-breakpoint values (FR-15)", () => {
  it("sets desktop as the base and tablet/phone as overrides", () => {
    expect(setAt(undefined, "d", "lg")).toEqual({ d: "lg" });
    expect(setAt({ d: "lg" }, "m", "sm")).toEqual({ d: "lg", m: "sm" });
    // A phone override with no base yet never changes desktop's look.
    expect(setAt(undefined, "m", "sm", "3xl")).toEqual({ d: "3xl", m: "sm" });
  });

  it("reads inherited values and reports overrides for the dots", () => {
    const v = { d: "lg", t: "md" } as const;
    expect(readAt(v, "m")).toEqual({ value: "md", overridden: false, inheritedFrom: "t" });
    expect(readAt(v, "t")).toEqual({ value: "md", overridden: true, inheritedFrom: undefined });
    expect(overriddenBps({ d: "lg", m: "sm" })).toEqual(["m"]);
    expect(overriddenBps({ d: "lg" })).toEqual([]);
  });

  it("clears an override so the breakpoint inherits again", () => {
    expect(clearAt({ d: "lg", t: "md", m: "sm" }, "t")).toEqual({ d: "lg", m: "sm" });
    expect(clearAt({ d: "lg" }, "d")).toEqual({ d: "lg" });
  });
});

describe("stack layout edits (FR-13)", () => {
  const section = (cols: number[], columns: number[]): Section =>
    ({
      id: "sec_aaaaaaaaaa",
      layout: { mode: "stack", columns: { d: cols }, order: { m: [1, 0] } },
      style: {},
      blocks: columns.map((c, i) => ({
        id: `blk_${String(i).padStart(10, "a")}`,
        type: "text",
        v: 1,
        fields: {},
        ...(c ? { column: c } : {}),
      })),
    }) as Section;

  it("changes the column count, moving blocks from removed columns into the last one", () => {
    const s = section([4, 4, 4], [0, 1, 2]);
    const { layout, moves } = setStackColumns(s, 2);
    expect(layout.columns).toEqual({ d: [6, 6] });
    expect(moves.map((m) => m.column)).toEqual([1]);
    expect(setStackColumns(s, 1).moves.map((m) => m.column)).toEqual([null, null]);
    const ops = stackColumnsOps("pg_aaaaaaaaaa", s, 1);
    expect(ops.at(-1)).toMatchObject({
      op: "section.update",
      set: { layout: { columns: { d: [12] } } },
    });
  });

  it("keeps a valid stacking order and drops natural order", () => {
    expect(normaliseOrder([1, 0], 2)).toEqual([1, 0]);
    expect(normaliseOrder([0, 1], 2)).toBeUndefined();
    expect(normaliseOrder([2, 2, 0], 3)).toEqual([2, 0, 1]);
    const layout = section([6, 6], [0, 1]).layout as StackLayout;
    expect(withStackOrder(layout, "t", [1, 0]).order).toEqual({ t: [1, 0], m: [1, 0] });
    expect(withStackOrder({ ...layout, order: { m: [1, 0] } }, "m", [0, 1]).order).toBeUndefined();
  });
});

describe("link picker model", () => {
  const doc = devSiteDocument();

  it("accepts every link type and refuses what the field disallows", () => {
    expect(checkLink({ type: "page", page: I.about }).ok).toBe(true);
    expect(checkLink({ type: "url", url: "https://example.com" }).ok).toBe(true);
    expect(checkLink({ type: "url", url: "/about" }).ok).toBe(true);
    expect(checkLink({ type: "email", email: "hello@example.com" }).ok).toBe(true);
    expect(checkLink({ type: "phone", phone: "+1 555 010 2030" }).ok).toBe(true);
    expect(checkLink({ type: "file", src: "media/2026/10/menu.pdf" }).ok).toBe(true);
    expect(checkLink({ type: "anchor", section: I.faq }).ok).toBe(true);
    expect(checkLink({ type: "item", collection: "blog", slug: "hello" }).ok).toBe(true);
    const bad = checkLink({ type: "url", url: "javascript:alert(1)" });
    expect(bad.ok).toBe(false);
    expect(checkLink({ type: "email", email: "hello@example.com" }, ["page", "url"])).toEqual({
      ok: false,
      message: "Email links aren’t allowed here.",
    });
  });

  it("normalises typed addresses and guesses the link type", () => {
    expect(normaliseUrl("example.com/x")).toBe("https://example.com/x");
    expect(normaliseUrl("/classes")).toBe("/classes");
    expect(guessLink("hello@example.com")).toEqual({ type: "email", email: "hello@example.com" });
    expect(guessLink("+44 20 7946 0000")).toEqual({ type: "phone", phone: "+44 20 7946 0000" });
    expect(guessLink("example.com")).toEqual({ type: "url", url: "https://example.com" });
  });

  it("describes where a link goes in plain words", () => {
    expect(describeLink(doc, { type: "page", page: I.about })).toBe("About");
    expect(describeLink(doc, { type: "url", url: "https://example.com/a" })).toBe("example.com/a");
    expect(describeLink(doc, undefined)).toBe("No link");
    expect(describeLink(doc, { type: "page", page: I.home, anchor: I.faq })).toMatch(/^Home › /);
  });
});

describe("form builder model (FR-30)", () => {
  const base = formBlock.create().fields.form as Form;

  it("only builds the eight allowed field types", () => {
    for (const t of FORM_FIELD_TYPES) {
      const f = newFormField(t, base);
      expect(FormSchema.safeParse({ ...base, fields: [...base.fields, f] }).success).toBe(true);
    }
    for (const t of FORBIDDEN_FORM_FIELD_TYPES)
      expect(() => newFormField(t as never, base)).toThrow(/not allowed/);
    expect(() => changeFieldType(base.fields[0] as never, "password" as never)).toThrow();
  });

  it("names fields uniquely in snake_case", () => {
    expect(snakeName("Your name")).toBe("your_name");
    expect(snakeName("2nd choice")).toBe("field_2nd_choice");
    expect(uniqueName("email", ["email", "email_2"])).toBe("email_3");
    const f = newFormField("email", base);
    expect(f.name).not.toBe("email");
  });

  it("refuses labels that ask for passwords or card details", () => {
    expect(isForbiddenText("Password")).toBe(true);
    expect(isForbiddenText("Card number")).toBe(true);
    expect(isForbiddenText("Your name")).toBe(false);
    const bad = { ...base, fields: [{ type: "text", name: "pw", label: "Password" }] } as Form;
    expect(formIssues(bad)[0]?.message).toMatch(/passwords or card details/);
    expect(formIssues(base)).toEqual([]);
  });

  it("keeps what carries over when a field changes type", () => {
    const f = { type: "text", name: "topic", label: "Topic", required: true } as const;
    expect(changeFieldType(f, "select")).toEqual({
      type: "select",
      name: "topic",
      label: "Topic",
      required: true,
      options: ["First option", "Second option"],
    });
  });
});

describe("list items", () => {
  const meta: ListFieldMeta = {
    kind: "list",
    optional: false,
    fields: {
      question: { kind: "text", optional: false, label: "Question" },
      form: { kind: "form", optional: true, label: "Form" },
    },
  };

  it("copies the last item for a new one, with fresh form ids", () => {
    const items = [{ question: "When?", form: { id: "frm_aaaaaaaaaa" } }];
    const next = newListItem(meta, items) as { question: string; form: { id: string } };
    expect(next.question).toBe("When?");
    expect(next.form.id).toMatch(/^frm_/);
    expect(next.form.id).not.toBe("frm_aaaaaaaaaa");
  });

  it("falls back to defaults, then blanks", () => {
    expect(newListItem(meta, [], [{ question: "Default" }])).toEqual({ question: "Default" });
    expect(newListItem(meta, [])).toEqual({ question: "New item" });
  });

  it("reorders without losing items", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("embed sanitizing", () => {
  it("requires https and refuses code carrying a secret", () => {
    expect(checkEmbed({ type: "url", url: "http://example.com" }, ["url"]).ok).toBe(false);
    expect(checkEmbed({ type: "url", url: " https://example.com/x " }, ["url"])).toEqual({
      ok: true,
      value: { type: "url", url: "https://example.com/x" },
    });
    const key = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");
    const r = checkEmbed({ type: "code", code: `<script>pay("${key}")</script>` }, ["code"]);
    expect(r.ok).toBe(false);
    expect(checkEmbed({ type: "code", code: "<b>hi</b>" }, ["url"]).ok).toBe(false);
  });
});
