import type { ProductFrontmatter } from "@openspace/schema";

export type ProductOption = NonNullable<ProductFrontmatter["options"]>[number];
export type ProductVariant = NonNullable<ProductFrontmatter["variants"]>[number];

/** Same option choices (order-insensitive). */
export function sameChoice(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Every combination of the options' values ("Size × Color"), in option order. */
export function combinations(options: ProductOption[]): Array<Record<string, string>> {
  const usable = options.filter((o) => o.name.trim() && o.values.length);
  if (!usable.length) return [];
  let out: Array<Record<string, string>> = [{}];
  for (const o of usable) {
    const next: Array<Record<string, string>> = [];
    for (const combo of out) for (const v of o.values) next.push({ ...combo, [o.name]: v });
    out = next;
  }
  return out;
}

/** "BLOCK" + {Size: "Wide", Color: "Sage green"} → "BLOCK-WIDE-SAGE-GREEN". */
export function suggestSku(base: string, choice: Record<string, string>): string {
  const parts = Object.values(choice).map((v) =>
    v
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  );
  return [base || "ITEM", ...parts].join("-").slice(0, 64);
}

/**
 * The variant list for these options: one per combination, keeping what was already set for a
 * combination (SKU, price, photo, availability). Renamed values lose their old settings.
 */
export function syncVariants(
  options: ProductOption[],
  existing: ProductVariant[],
  baseSku: string,
): ProductVariant[] {
  return combinations(options)
    .slice(0, 100)
    .map((choice) => {
      const prev = existing.find((v) => sameChoice(v.options, choice));
      return prev
        ? { ...prev, options: choice }
        : { options: choice, sku: suggestSku(baseSku, choice) };
    });
}

export function variantLabel(v: ProductVariant): string {
  return Object.values(v.options).join(" / ") || "Default";
}
