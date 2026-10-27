/**
 * Manifests published with the site for the Hub:
 * - `/_os/forms.json`: every form's schema (the Hub validates submissions against it, cached by
 *   hash — arch §9.1).
 * - `/_os/catalog.json`: the public product catalog with prices in minor units and SKUs. The Hub
 *   (or the site Worker in sovereign mode) re-reads prices from here at checkout; prices are
 *   never trusted from the browser (arch §9.5, GC12).
 * Both are deterministic (no timestamps) so unchanged content yields byte-identical files.
 */
import {
  type Block,
  type Form,
  formRedirectHref,
  type Money,
  type Page,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { contentHash } from "./ids";
import type { SitePlan } from "./routes";

export const FORMS_MANIFEST_PATH = "/_os/forms.json";
export const CATALOG_MANIFEST_PATH = "/_os/catalog.json";

/**
 * The Hub's forms manifest contract (task 16, `parseManifest`): `forms` maps form id → the
 * `Form` schema itself plus `redirectHref` (site path or absolute URL for a no-JS success
 * redirect). Extra top-level keys (`siteId`, `pages`) are informational.
 */
export interface FormsManifest {
  version: 1;
  siteId: string;
  /** Hash of `forms` (the Hub caches schemas by it). */
  hash: string;
  forms: Record<string, Form & { redirectHref: string | null }>;
  /** Site-relative paths (without the base) of pages showing each form. */
  pages: Record<string, string[]>;
}

const pagePath = (p: Pick<Page, "slug">) => (p.slug ? `/${p.slug}/` : "/");

function blocksOf(doc: SiteDocument): { block: Block; page: string | undefined }[] {
  const out: { block: Block; page: string | undefined }[] = [];
  for (const page of Object.values(doc.pages))
    for (const s of page.sections)
      for (const b of s.blocks) out.push({ block: b, page: pagePath(page) });
  for (const b of doc.site.footer.blocks) out.push({ block: b, page: undefined });
  return out;
}

export function formsManifest(plan: SitePlan): FormsManifest {
  const forms: Record<string, Form> = {};
  const pages: Record<string, string[]> = {};
  const footerForms: string[] = [];
  const allPaths = plan.routes.filter((r) => r.kind !== "notFound").map((r) => r.path);
  for (const { block, page } of blocksOf(plan.doc)) {
    if (block.type !== "form") continue;
    const form = block.fields.form as Form | undefined;
    if (!form?.id) continue;
    const seen = forms[form.id];
    if (seen && JSON.stringify(seen) !== JSON.stringify(form))
      throw new Error(
        `Two different forms share the id ${form.id} (on ${page ?? "the footer"} and elsewhere): give one of them a new frm_ id so their entries don't mix.`,
      );
    forms[form.id] ??= form;
    pages[form.id] ??= [];
    const list = pages[form.id] as string[];
    if (page === undefined) footerForms.push(form.id);
    else if (!list.includes(page)) list.push(page);
  }
  for (const id of footerForms) pages[id] = [...allPaths];
  const ids = Object.keys(forms).sort();
  const sorted = Object.fromEntries(
    ids.map((id) => [
      id,
      { ...(forms[id] as Form), redirectHref: formRedirectHref(forms[id] as Form, plan.doc.pages) },
    ]),
  );
  return {
    version: 1,
    siteId: plan.doc.config.siteId,
    hash: contentHash(JSON.stringify(sorted), 16),
    forms: sorted,
    pages: Object.fromEntries(ids.map((id) => [id, [...(pages[id] ?? [])].sort()])),
  };
}

export interface CatalogVariant {
  sku: string;
  options: Record<string, string>;
  price: Money;
  /** Shipping weight in grams. */
  weight?: number;
  available: boolean;
}

export interface CatalogProduct {
  collection: string;
  slug: string;
  title: string;
  /** Site-relative URL without the base. */
  path: string;
  sku: string;
  price: Money;
  compareAtPrice?: Money;
  available: boolean;
  digital: boolean;
  /** Shipping weight in grams (weight-based shipping, server-side). */
  weight?: number;
  /** Subscription products: billed every month or year. */
  interval?: "month" | "year";
  image?: string;
  options?: { name: string; values: string[] }[];
  variants?: CatalogVariant[];
}

export interface CatalogManifest {
  version: 1;
  siteId: string;
  hash: string;
  currency: string | null;
  products: CatalogProduct[];
  /** Every purchasable SKU → its authoritative price (what checkout charges). */
  skus: Record<string, { price: Money; collection: string; slug: string; available: boolean }>;
}

/** Thrown when two purchasable things share a SKU (checkout couldn't tell them apart). */
function claimSku(skus: CatalogManifest["skus"], sku: string, where: string): void {
  const prev = skus[sku];
  if (prev)
    throw new Error(
      `SKU ${sku} is used by both ${prev.collection}/${prev.slug} and ${where}: SKUs must be unique.`,
    );
}

export function catalogManifest(plan: SitePlan): CatalogManifest {
  const products: CatalogProduct[] = [];
  const skus: CatalogManifest["skus"] = {};
  const currencies = new Set<string>();
  for (const [collection, items] of Object.entries(plan.items)) {
    for (const item of items) {
      if (item.kind !== "products") continue;
      const fm = item.frontmatter;
      const sku = fm.sku ?? `${collection}/${item.slug}`;
      const available = fm.available !== false;
      const product: CatalogProduct = {
        collection,
        slug: item.slug,
        title: fm.title,
        path: `/${collection}/${item.slug}/`,
        sku,
        price: fm.price,
        available,
        digital: fm.digital === true,
      };
      if (fm.compareAtPrice) product.compareAtPrice = fm.compareAtPrice;
      if (fm.weight !== undefined) product.weight = fm.weight;
      if (fm.subscription) product.interval = fm.subscription.interval;
      const image = fm.image ?? fm.images?.[0]?.src;
      if (image) product.image = image;
      if (fm.options?.length) product.options = fm.options;
      currencies.add(fm.price.currency);
      if (fm.variants?.length) {
        product.variants = fm.variants.map((v, i) => {
          const vsku = v.sku ?? `${sku}#${i + 1}`;
          const variant: CatalogVariant = {
            sku: vsku,
            options: v.options,
            price: v.price ?? fm.price,
            available: available && v.available !== false,
          };
          if (v.weight !== undefined) variant.weight = v.weight;
          claimSku(skus, vsku, `${collection}/${item.slug}`);
          skus[vsku] = {
            price: variant.price,
            collection,
            slug: item.slug,
            available: variant.available,
          };
          return variant;
        });
      } else {
        claimSku(skus, sku, `${collection}/${item.slug}`);
        skus[sku] = { price: fm.price, collection, slug: item.slug, available };
      }
      products.push(product);
    }
  }
  products.sort((a, b) => a.path.localeCompare(b.path));
  const sortedSkus = Object.fromEntries(
    Object.entries(skus).sort(([a], [b]) => a.localeCompare(b)),
  );
  const body = { products, skus: sortedSkus };
  return {
    version: 1,
    siteId: plan.doc.config.siteId,
    hash: contentHash(JSON.stringify(body), 16),
    currency: currencies.size === 1 ? ([...currencies][0] ?? null) : null,
    ...body,
  };
}
