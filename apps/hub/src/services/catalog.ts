/**
 * The published product catalog — the ONLY source of prices at checkout (arch §9.5, GC12).
 *
 * - Production: `<site>/_os/catalog.json` emitted by site-kit (`catalogManifest`, Task 10), fetched
 *   with a 60 s edge cache. If it can't be read (or belongs to another site) the published
 *   document is read through GitHub instead.
 * - Dev (emulated GitHub): derived from the published document's product collections with the
 *   same rules as site-kit: SKU = `fm.sku ?? "<collection>/<slug>"`, variant SKU =
 *   `v.sku ?? "<sku>#<n>"`, only published (or due scheduled) items, `available` defaults true.
 */
import type { Money, SiteDocument } from "@openspace/schema";
import { z } from "zod";
import type { SiteRow } from "../db/sites";
import { siteBaseUrl } from "./email";
import type { Services } from "./index";
import { readSiteDocument } from "./sites";

export interface CatalogEntry {
  sku: string;
  title: string;
  price: Money;
  available: boolean;
  digital: boolean;
  collection: string;
  slug: string;
  path: string;
  /** Shipping weight in grams (0 when not given). */
  weight: number;
  /** Subscription products: the billing interval; null for one-time purchases. */
  interval: "month" | "year" | null;
}

export interface Catalog {
  source: "manifest" | "document";
  hash: string | null;
  skus: Map<string, CatalogEntry>;
}

const MoneyZ = z.object({
  amount: z.number().int().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const ManifestSchema = z.object({
  version: z.literal(1),
  siteId: z.string(),
  hash: z.string().optional(),
  products: z.array(
    z.object({
      collection: z.string(),
      slug: z.string(),
      title: z.string(),
      path: z.string().optional(),
      sku: z.string(),
      price: MoneyZ,
      available: z.boolean().optional(),
      digital: z.boolean().optional(),
      weight: z.number().int().min(0).max(1_000_000).optional(),
      interval: z.enum(["month", "year"]).optional(),
      variants: z
        .array(
          z.object({
            sku: z.string(),
            options: z.record(z.string(), z.string()),
            price: MoneyZ,
            available: z.boolean().optional(),
            weight: z.number().int().min(0).max(1_000_000).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

function variantTitle(title: string, options: Record<string, string>): string {
  const label = Object.values(options).join(" / ");
  return label ? `${title} — ${label}` : title;
}

function fromManifest(m: z.infer<typeof ManifestSchema>): Catalog {
  const skus = new Map<string, CatalogEntry>();
  for (const p of m.products) {
    const base = {
      collection: p.collection,
      slug: p.slug,
      digital: p.digital === true,
      path: p.path ?? `/${p.collection}/${p.slug}/`,
      weight: p.weight ?? 0,
      interval: p.interval ?? null,
    };
    if (p.variants?.length)
      for (const v of p.variants)
        skus.set(v.sku, {
          ...base,
          weight: v.weight ?? base.weight,
          sku: v.sku,
          title: variantTitle(p.title, v.options),
          price: v.price,
          available: p.available !== false && v.available !== false,
        });
    else
      skus.set(p.sku, {
        ...base,
        sku: p.sku,
        title: p.title,
        price: p.price,
        available: p.available !== false,
      });
  }
  return { source: "manifest", hash: m.hash ?? null, skus };
}

/** Same rules as site-kit's `catalogManifest`, over the published document. */
export function catalogFromDocument(doc: SiteDocument, now: number): Catalog {
  const skus = new Map<string, CatalogEntry>();
  for (const [collection, items] of Object.entries(doc.collections ?? {})) {
    for (const item of Object.values(items)) {
      if (item.kind !== "products") continue;
      const fm = item.frontmatter;
      const live =
        fm.status === "published" ||
        (fm.status === "scheduled" && !!fm.publishAt && Date.parse(fm.publishAt) <= now);
      if (!live) continue;
      const sku = fm.sku ?? `${collection}/${item.slug}`;
      const available = fm.available !== false;
      const base = {
        collection,
        slug: item.slug,
        digital: fm.digital === true,
        path: `/${collection}/${item.slug}/`,
        weight: fm.weight ?? 0,
        interval: fm.subscription?.interval ?? null,
      };
      if (fm.variants?.length)
        fm.variants.forEach((v, i) => {
          const vsku = v.sku ?? `${sku}#${i + 1}`;
          skus.set(vsku, {
            ...base,
            weight: v.weight ?? base.weight,
            sku: vsku,
            title: variantTitle(fm.title, v.options),
            price: v.price ?? fm.price,
            available: available && v.available !== false,
          });
        });
      else skus.set(sku, { ...base, sku, title: fm.title, price: fm.price, available });
    }
  }
  return { source: "document", hash: null, skus };
}

async function fromSite(services: Services, site: SiteRow): Promise<Catalog | null> {
  try {
    const url = new URL("_os/catalog.json", siteBaseUrl(site, services.config.hubUrl));
    const res = await services.fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 60, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    const parsed = ManifestSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.siteId !== site.id) return null;
    return fromManifest(parsed.data);
  } catch {
    return null;
  }
}

export async function loadCatalog(services: Services, site: SiteRow): Promise<Catalog> {
  if (!services.config.useDevGitHub) {
    const manifest = await fromSite(services, site);
    if (manifest) return manifest;
  }
  const snap = await readSiteDocument(services, site, "published");
  return catalogFromDocument(snap.doc, services.now());
}
