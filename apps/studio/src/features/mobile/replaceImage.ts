import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import type { Block, SiteDocument } from "@omniharmonic/openspace-schema";
import type { EditorStore } from "../editor/model/store";
import { fieldsOp } from "../inspector/model/edits";

/** The block's first image field (an image block's photo, a card's picture…), if any. */
export function imageFieldOf(block: Block): { key: string; label: string } | null {
  const def = blocksRegistry().get(block.type);
  if (!def) return null;
  for (const [key, meta] of Object.entries(def.meta.fields)) {
    const m = meta as { kind?: string; label?: string };
    if (m.kind === "image") return { key, label: m.label ?? "Image" };
  }
  return null;
}

interface ImageValue {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  mediaId?: string;
  focal?: [number, number];
}

/** Resolves once the site's media has the file (its upload finished), or null on timeout. */
export function waitForMedia(
  store: EditorStore,
  path: string,
  timeoutMs = 60_000,
): Promise<SiteDocument["media"][keyof SiteDocument["media"]] | null> {
  const has = () => store.getState().doc.media[path as keyof SiteDocument["media"]];
  const now = has();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);
    const unsubscribe = store.subscribe(() => {
      const meta = has();
      if (!meta) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(meta);
    });
  });
}

/** The alt text of a block's current image (before replacing it), if any. */
export function blockImageAlt(store: EditorStore, container: string, blockId: string): string {
  const s = store.getState();
  const page =
    container === "footer" ? null : s.doc.pages[container as keyof SiteDocument["pages"]];
  const sections = container === "footer" ? [s.doc.site.footer] : (page?.sections ?? []);
  const block = sections.flatMap((x) => x.blocks).find((b) => b.id === blockId);
  const field = block && imageFieldOf(block);
  if (!block || !field) return "";
  return (
    ((block.fields as Record<string, unknown>)[field.key] as ImageValue | undefined)?.alt ?? ""
  );
}

/**
 * Point a block's image field at a library file, as one undoable edit. The old picture's alt
 * text describes the old picture, so it isn't carried over: the file's own alt is used (or none,
 * which the design check flags) unless `alt` is given. Returns an error message, or null.
 */
export function setBlockImage(
  store: EditorStore,
  container: string,
  blockId: string,
  path: string,
  opts: { alt?: string } = {},
): string | null {
  const s = store.getState();
  const page =
    container === "footer" ? null : s.doc.pages[container as keyof SiteDocument["pages"]];
  const sections = container === "footer" ? [s.doc.site.footer] : (page?.sections ?? []);
  const block = sections.flatMap((x) => x.blocks).find((b) => b.id === blockId);
  if (!block) return "That block is gone.";
  const field = imageFieldOf(block);
  if (!field) return "This block has no photo.";
  const meta = s.doc.media[path as keyof SiteDocument["media"]];
  const next: ImageValue = {
    src: path,
    alt: opts.alt ?? (meta?.alt || ""),
    ...(meta?.width && meta?.height ? { width: meta.width, height: meta.height } : {}),
    ...(meta?.id ? { mediaId: meta.id } : {}),
    ...(meta?.focal ? { focal: meta.focal as [number, number] } : {}),
  };
  const r = s.commit([fieldsOp(container, block, { [field.key]: next })], {
    label: "Replace photo",
  });
  return r.ok ? null : (r.errors[0]?.message ?? "That photo couldn’t be used here.");
}
