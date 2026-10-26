import {
  type Block,
  CROCKFORD_ALPHABET,
  type GridRect,
  type IdPrefix,
  type NavItem,
  type Page,
  type Section,
  type SiteDocument,
} from "@openspace/schema";
import fc from "fast-check";
import { type ContainerId, FOOTER, type Op, type OpBody } from "../ops";

/** A deterministic, valid id from a number (so fast-check runs are reproducible). */
export function idFrom<P extends IdPrefix>(prefix: P, n: number): `${P}_${string}` {
  let body = "";
  let x = Math.abs(Math.floor(n)) + 7919;
  for (let i = 0; i < 10; i++) {
    body += CROCKFORD_ALPHABET[x % 32];
    x = Math.floor(x / 32) + i * 131 + 17;
  }
  return `${prefix}_${body}` as `${P}_${string}`;
}

let counter = 0;
export function meta(actor = "ana", ts = 1000): { id: string; actor: string; ts: number } {
  counter++;
  return { id: `op-${counter}`, actor, ts };
}

export function stampOp(body: OpBody, actor = "ana", ts = 1000): Op {
  return { ...body, ...meta(actor, ts) } as Op;
}

export function textBlock(id: Block["id"], text: string, column?: number): Block {
  const b: Block = {
    id,
    type: "text",
    v: 1,
    fields: {
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    },
  };
  if (column !== undefined) b.column = column;
  return b;
}

export function stackSection(
  id: Section["id"],
  blocks: Block[],
  columns: number[] = [12],
): Section {
  return { id, layout: { mode: "stack", columns: { d: columns } }, style: {}, blocks };
}

/** One random choice that `buildOp` turns into an op against the current document. */
export interface Choice {
  k: number;
  i: number;
  j: number;
  n: number;
  b: boolean;
  t: string;
}

export const choiceArb: fc.Arbitrary<Choice> = fc.record({
  k: fc.nat(200),
  i: fc.nat(1000),
  j: fc.nat(1000),
  n: fc.nat(100000),
  b: fc.boolean(),
  t: fc.constantFrom("Hello", "Spring schedule", "Workshops", "Om", "Retreat 2027", "Breathe"),
});

interface Loc {
  container: ContainerId;
  section: Section;
}

function allSections(doc: SiteDocument): Loc[] {
  const out: Loc[] = [{ container: FOOTER, section: doc.site.footer }];
  for (const page of Object.values(doc.pages))
    for (const section of page.sections) out.push({ container: page.id, section });
  return out;
}

function allBlocks(doc: SiteDocument): (Loc & { block: Block; index: number })[] {
  return allSections(doc).flatMap((loc) =>
    loc.section.blocks.map((block, index) => ({ ...loc, block, index })),
  );
}

const pick = <T>(xs: readonly T[], i: number): T | undefined =>
  xs.length ? xs[i % xs.length] : undefined;

function rectFor(cols: number, c: Choice): GridRect {
  const w = 1 + (c.n % cols);
  const x = 1 + (c.j % (cols - w + 1));
  return { x, y: 1 + (c.i % 30), w, h: 1 + (c.n % 9) };
}

const COLORS = ["oklch(0.62 0.09 145)", "#336699", "oklch(0.5 0.1 30)"];
const THEMES = ["light", "light-accent", "dark", "dark-accent", "brand"] as const;

/**
 * Build a (usually valid) op from a choice and the current document. Some ops are deliberately
 * invalid (dangling refs, bad positions) so `validate` gets exercised; property tests filter
 * with `validate`.
 */
export function buildOp(doc: SiteDocument, c: Choice): OpBody | undefined {
  const pages = Object.values(doc.pages);
  const kind = c.k % 21;
  switch (kind) {
    case 0: {
      const loc = pick(allBlocks(doc), c.i);
      if (!loc) return undefined;
      if (c.n % 4 === 0)
        return {
          op: "block.update",
          page: loc.container,
          block: loc.block.id,
          variant: c.b ? "outline" : null,
        };
      if (c.n % 4 === 1)
        return {
          op: "block.update",
          page: loc.container,
          block: loc.block.id,
          style: c.b ? { radius: "lg", padding: { d: "md" } } : null,
        };
      return c.b
        ? {
            op: "block.update",
            page: loc.container,
            block: loc.block.id,
            set: {
              caption: c.t,
              content: {
                type: "doc",
                content: [{ type: "paragraph", content: [{ type: "text", text: c.t }] }],
              },
            },
          }
        : { op: "block.update", page: loc.container, block: loc.block.id, unset: ["caption"] };
    }
    case 1:
    case 2: {
      const loc = pick(allSections(doc), c.i);
      if (!loc) return undefined;
      const s = loc.section;
      const block = textBlock(idFrom("blk", c.n), c.t);
      if (s.layout.mode === "stack" && c.b) block.column = c.j % s.layout.columns.d.length;
      const at = c.j % (s.blocks.length + 2); // occasionally out of range
      const body: OpBody = { op: "block.insert", page: loc.container, section: s.id, at, block };
      if (s.layout.mode === "grid" && c.b)
        (body as { place?: unknown }).place = {
          d: rectFor(24, c),
          m: rectFor(8, { ...c, n: c.n + 3 }),
        };
      return body;
    }
    case 3:
    case 4: {
      const loc = pick(allBlocks(doc), c.i);
      if (!loc) return undefined;
      const sections = allSections(doc).filter((l) => l.container === loc.container);
      const dest = pick(sections, c.j) as Loc;
      const to: {
        section: Section["id"];
        at: number | "end";
        place?: unknown;
        column?: number | null;
      } = {
        section: dest.section.id,
        at: c.n % 3 === 0 ? "end" : c.n % (dest.section.blocks.length + 1),
      };
      if (dest.section.layout.mode === "grid" && c.b) to.place = { d: rectFor(24, c) };
      if (dest.section.layout.mode === "stack" && c.b)
        to.column = c.i % dest.section.layout.columns.d.length;
      return { op: "block.move", page: loc.container, block: loc.block.id, to } as OpBody;
    }
    case 5: {
      const loc = pick(allBlocks(doc), c.i);
      if (!loc) return undefined;
      return { op: "block.delete", page: loc.container, block: loc.block.id };
    }
    case 6:
    case 7: {
      const grids = allBlocks(doc).filter((l) => l.section.layout.mode === "grid");
      const loc = pick(grids, c.i);
      if (!loc) return undefined;
      const bp = (["d", "t", "m"] as const)[c.n % 3] as "d" | "t" | "m";
      const rect = !c.b && bp !== "d" ? null : rectFor(bp === "m" ? 8 : 24, c);
      return {
        op: "grid.place",
        page: loc.container,
        section: loc.section.id,
        block: loc.block.id,
        bp,
        rect,
      };
    }
    case 8: {
      const page = pick(pages, c.i);
      if (!page) return undefined;
      const blocks = [textBlock(idFrom("blk", c.n + 1), c.t, 0)];
      if (c.b) blocks.push(textBlock(idFrom("blk", c.n + 2), "Second column", 1));
      return {
        op: "section.insert",
        page: page.id,
        at: c.j % (page.sections.length + 1),
        section: stackSection(idFrom("sec", c.n), blocks, c.b ? [6, 6] : [12]),
      };
    }
    case 9: {
      const page = pick(pages, c.i);
      const s = page && pick(page.sections, c.j);
      if (!page || !s) return undefined;
      return { op: "section.move", page: page.id, section: s.id, at: c.n % page.sections.length };
    }
    case 10: {
      const page = pick(pages, c.i);
      const s = page && pick(page.sections, c.j);
      if (!page || !s) return undefined;
      return { op: "section.delete", page: page.id, section: s.id };
    }
    case 11: {
      const loc = pick(allSections(doc), c.i);
      if (!loc) return undefined;
      const variants: OpBody[] = [
        { op: "section.update", page: loc.container, section: loc.section.id, set: { label: c.t } },
        { op: "section.update", page: loc.container, section: loc.section.id, unset: ["label"] },
        {
          op: "section.update",
          page: loc.container,
          section: loc.section.id,
          set: { "style.colorTheme": THEMES[c.n % 5] },
        },
        {
          op: "section.update",
          page: loc.container,
          section: loc.section.id,
          set: { hidden: c.b, "style.padding": { d: "lg" } },
        },
      ];
      return variants[c.n % variants.length];
    }
    case 12: {
      const variants: OpBody[] = [
        { op: "styles.patch", patch: { set: { "choices.palette.brand": COLORS[c.n % 3] } } },
        {
          op: "styles.patch",
          patch: {
            set: { [`overrides.color.c${c.n % 4}`]: { $value: COLORS[c.j % 3], $type: "color" } },
          },
        },
        { op: "styles.patch", patch: { unset: ["overrides"] } },
        {
          op: "styles.patch",
          patch: {
            set: {
              "choices.density": c.b ? "compact" : "airy",
              "choices.pairing": "fraunces-hanken",
            },
          },
        },
      ];
      return variants[c.n % variants.length];
    }
    case 13: {
      const id = idFrom("pg", c.n);
      const page: Page = {
        id,
        title: c.t,
        slug: `p-${c.n % 50}`,
        sections: [
          stackSection(idFrom("sec", c.n + 11), [textBlock(idFrom("blk", c.n + 12), c.t)]),
        ],
      };
      return c.b
        ? { op: "page.create", page, nav: [...doc.site.nav, { type: "page", page: id }] }
        : { op: "page.create", page };
    }
    case 14: {
      const page = pick(pages, c.i);
      if (!page) return undefined;
      const variants: OpBody[] = [
        { op: "page.update", page: page.id, set: { title: c.t } },
        { op: "page.update", page: page.id, set: { "seo.description": c.t } },
        { op: "page.update", page: page.id, unset: ["seo"] },
        { op: "page.update", page: page.id, set: { slug: `s-${c.n % 30}`, hidden: c.b } },
      ];
      return variants[c.n % variants.length];
    }
    case 15: {
      const page = pick(pages, c.i);
      if (!page) return undefined;
      return c.b
        ? { op: "page.delete", page: page.id, nav: pruneRefs(doc.site.nav, page.id) }
        : { op: "page.delete", page: page.id };
    }
    case 16: {
      const nav = [...doc.site.nav];
      if (c.b && nav.length) nav.splice(c.i % nav.length, 1);
      else {
        const target = pick(pages, c.j);
        nav.push({
          type: "page",
          page: c.n % 5 === 0 || !target ? idFrom("pg", c.n + 99) : target.id,
          label: c.t,
        });
      }
      return { op: "nav.update", tree: nav };
    }
    case 17: {
      const variants: OpBody[] = [
        { op: "site.update", set: { title: c.t } },
        { op: "site.update", unset: ["tagline"] },
        {
          op: "site.update",
          set: { "header.sticky": c.b, "header.variant": c.b ? "split-nav" : "classic-left" },
        },
        { op: "site.update", set: { "seo.description": c.t } },
      ];
      return variants[c.n % variants.length];
    }
    case 18: {
      const paths = Object.keys(doc.media);
      if (c.b && paths.length) return { op: "media.remove", path: pick(paths, c.i) as string };
      const path = `media/2026/11/photo-${c.n % 20}.jpg`;
      return {
        op: "media.add",
        path,
        meta: {
          id: idFrom("med", c.n % 20),
          path,
          kind: "image",
          mime: "image/jpeg",
          bytes: 1000 + c.n,
          width: 1200,
          height: 800,
          alt: c.t,
          createdAt: "2026-11-01T10:00:00Z",
        },
      };
    }
    case 19: {
      const items = Object.entries(doc.collections).flatMap(([name, xs]) =>
        Object.keys(xs).map((slug) => ({ name, slug })),
      );
      if (c.b && items.length) {
        const it = pick(items, c.i) as { name: string; slug: string };
        return { op: "collection.delete", collection: it.name, slug: it.slug };
      }
      const collection = c.n % 3 === 0 ? "notes" : "journal";
      const slug = `post-${c.n % 10}`;
      return {
        op: "collection.upsert",
        collection,
        item: {
          kind: "blog",
          slug,
          frontmatter: { title: c.t, date: "2026-11-02", status: c.j % 2 ? "draft" : "published" },
          body: `${c.t}\n`,
        },
      };
    }
    default: {
      const names = ["journal", "notes", "events"];
      const collection = names[c.n % 3] as string;
      if (c.b) return { op: "collectionConfig.upsert", collection, config: null };
      return {
        op: "collectionConfig.upsert",
        collection,
        config: {
          kind: collection === "events" ? "events" : "blog",
          label: c.t,
          list: { layout: "cards", pageSize: 1 + (c.i % 20), sort: "date-desc" },
        },
      };
    }
  }
}

export function pruneRefs(nav: readonly NavItem[], pageId: string): NavItem[] {
  return nav
    .filter((i) => !(i.type === "page" && i.page === pageId))
    .filter((i) => !(i.type === "button" && i.link.type === "page" && i.link.page === pageId))
    .map((i) =>
      i.type === "folder"
        ? {
            ...i,
            ...(i.page === pageId ? { page: undefined } : {}),
            items: i.items.filter((l) => !(l.type === "page" && l.page === pageId)),
          }
        : i,
    )
    .map((i) => JSON.parse(JSON.stringify(i)) as NavItem);
}
