import type { CollectionItem } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { productPrice } from "./blocks/collections";

const item = (fm: Record<string, unknown>) =>
  ({
    kind: "products",
    slug: "tea",
    frontmatter: {
      title: "Tea",
      status: "published",
      price: { amount: 1500, currency: "USD" },
      ...fm,
    },
    body: "",
  }) as unknown as CollectionItem;

describe("productPrice", () => {
  it("labels subscription prices with their interval", () => {
    expect(productPrice(item({}), "en-US")?.text).toBe("$15");
    expect(productPrice(item({ subscription: { interval: "month" } }), "en-US")?.text).toBe(
      "$15 / month",
    );
    expect(productPrice(item({ subscription: { interval: "year" } }), "en-US")?.text).toBe(
      "$15 / year",
    );
  });
});
