import { describe, expect, it } from "vitest";
import { type Form, formRedirectHref } from "./form";

const base: Omit<Form, "success"> = {
  id: "frm_aaaaaaaaaa",
  name: "Contact",
  fields: [{ type: "email", name: "email", label: "Email" }],
  submitLabel: "Send",
};
const pages = { pg_aaaaaaaaaa: { slug: "" }, pg_bbbbbbbbbb: { slug: "thanks" } };

describe("formRedirectHref", () => {
  it("is null for message forms", () => {
    expect(formRedirectHref({ ...base, success: { type: "message", message: "Hi" } }, pages)).toBe(
      null,
    );
  });
  it("resolves pages to trailing-slash site paths with anchors", () => {
    const f = (page: string, anchor?: string): Form => ({
      ...base,
      success: {
        type: "redirect",
        link: { type: "page", page: page as `pg_${string}`, ...(anchor ? { anchor } : {}) },
      },
    });
    expect(formRedirectHref(f("pg_bbbbbbbbbb"), pages)).toBe("/thanks/");
    expect(formRedirectHref(f("pg_aaaaaaaaaa", "top"), pages)).toBe("/#top");
    expect(formRedirectHref(f("pg_cccccccccc"), pages)).toBe(null);
  });
  it("passes URLs through and resolves collection items", () => {
    expect(
      formRedirectHref(
        { ...base, success: { type: "redirect", link: { type: "url", url: "https://x.org/" } } },
        pages,
      ),
    ).toBe("https://x.org/");
    expect(
      formRedirectHref(
        {
          ...base,
          success: { type: "redirect", link: { type: "item", collection: "blog", slug: "hi" } },
        },
        pages,
      ),
    ).toBe("/blog/hi/");
  });
});
