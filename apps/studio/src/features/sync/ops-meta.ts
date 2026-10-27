import type { Op } from "@omniharmonic/openspace-ops";

/** The page an op touches (for "Claude is editing Home…" and agent summaries). */
export function pageOf(op: Op): string | null {
  const p = (op as { page?: unknown }).page;
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && "id" in p) return String((p as { id: unknown }).id);
  return null;
}
