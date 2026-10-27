import type { CollectionItem } from "@omniharmonic/openspace-schema";
import { canonicalJson } from "../../api/canonical";

/** Line diff (longest common subsequence) for reviewing a body. */
export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 4_000_000)
    return [
      ...a.map((text) => ({ kind: "remove" as const, text })),
      ...b.map((text) => ({ kind: "add" as const, text })),
    ];
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      (dp[i] as number[])[j] =
        a[i] === b[j]
          ? ((dp[i + 1] as number[])[j + 1] as number) + 1
          : Math.max((dp[i + 1] as number[])[j] as number, (dp[i] as number[])[j + 1] as number);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] as string });
      i++;
      j++;
    } else if (((dp[i + 1] as number[])[j] as number) >= ((dp[i] as number[])[j + 1] as number)) {
      out.push({ kind: "remove", text: a[i] as string });
      i++;
    } else {
      out.push({ kind: "add", text: b[j] as string });
      j++;
    }
  }
  while (i < n) out.push({ kind: "remove", text: a[i++] as string });
  while (j < m) out.push({ kind: "add", text: b[j++] as string });
  return out;
}

const LABELS: Record<string, string> = {
  title: "Title",
  status: "Status",
  publishAt: "Goes live",
  date: "Date",
  excerpt: "Excerpt",
  image: "Featured image",
  imageAlt: "Image description",
  categories: "Categories",
  tags: "Tags",
  author: "Author",
  start: "Starts",
  end: "Ends",
  location: "Location",
  registrationUrl: "Sign-up link",
  recurrence: "Repeats",
  price: "Price",
  variants: "Variants",
  options: "Options",
  audio: "Audio",
  seo: "Search and sharing",
};

export interface FieldChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v.join(", ");
  return JSON.stringify(v);
}

/** Changed frontmatter fields between two versions (before may be absent: a new item). */
export function fieldChanges(
  before: CollectionItem | undefined,
  after: CollectionItem,
): FieldChange[] {
  const b = (before?.frontmatter ?? {}) as Record<string, unknown>;
  const a = after.frontmatter as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const out: FieldChange[] = [];
  if (before && before.slug !== after.slug)
    out.push({ key: "slug", label: "Address", before: before.slug, after: after.slug });
  for (const k of keys) {
    if (canonicalJson(a[k]) === canonicalJson(b[k])) continue;
    out.push({ key: k, label: LABELS[k] ?? k, before: show(b[k]), after: show(a[k]) });
  }
  return out;
}
