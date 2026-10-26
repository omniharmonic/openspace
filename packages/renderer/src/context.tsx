import type { Block, Page, RichTextDoc, Section, SiteDocument } from "@openspace/schema";
import { createContext, type ReactNode, useContext } from "react";
import type { ImageMap } from "./image-map";
import type { RendererBlockRegistry } from "./registry";

/**
 * Render modes.
 * - `production`: the published site (site-kit build). Broken references render nothing.
 * - `preview`: Hub dev preview / share links. Like production, plus visible notices for broken
 *   blocks and links, and always `noindex`.
 * - `editor`: Studio canvas. Like preview, plus no entrance animations and editor hooks.
 */
export type RenderMode = "production" | "preview" | "editor";

export interface RenderContextValue {
  /** The whole site; optional so primitives (`<Img>`, `<Link>`) can render standalone. */
  doc: SiteDocument | undefined;
  /** The page being rendered, if any (used for same-page anchors). */
  page: Page | undefined;
  mode: RenderMode;
  /** Site base path without a trailing slash: `""` or `/maya-yoga`. */
  basePath: string;
  /** Hub origin used by forms, newsletter, cart and analytics. */
  hubUrl: string | undefined;
}

const DEFAULT_CONTEXT: RenderContextValue = {
  doc: undefined,
  page: undefined,
  mode: "production",
  basePath: "",
  hubUrl: undefined,
};

export const RenderContext = createContext<RenderContextValue>(DEFAULT_CONTEXT);

export function useRenderContext(): RenderContextValue {
  return useContext(RenderContext);
}

/** Resolved image map (see {@link ImageMap}); `<Img>` reads it. */
export const ImageResolverContext = createContext<ImageMap>({});

export function useImageMap(): ImageMap {
  return useContext(ImageResolverContext);
}

/** Optional block registry override (defaults to the module-level registry). */
export const BlockRegistryContext = createContext<RendererBlockRegistry | undefined>(undefined);

/**
 * Hook point for Studio. The renderer always emits `data-os-id` on sections and blocks; in the
 * canvas, Studio can additionally wrap each rendered section/block (selection outlines,
 * drag handles) without the renderer knowing anything about the editor.
 */
export interface EditorHooks {
  wrapSection?: (args: { section: Section; children: ReactNode }) => ReactNode;
  wrapBlock?: (args: {
    block: Block;
    section: Section | undefined;
    children: ReactNode;
  }) => ReactNode;
  /** Rendered in place of unknown/invalid blocks (defaults to a small notice). */
  renderMissingBlock?: (args: { block: Block; reason: string }) => ReactNode;
  /**
   * Called by `<RichText>` for a rich-text value that is one of the current block's fields, so
   * Studio can swap in an inline editor. `children` is what `<RichText>` would have rendered
   * (null for an empty document); return it unchanged to keep the normal output.
   */
  renderRichText?: (args: RichTextHookArgs) => ReactNode;
}

export interface RichTextHookArgs {
  block: Block;
  /** Dot path of the field inside `block.fields`, e.g. `content` or `items.2.body`. */
  fieldPath: string;
  doc: RichTextDoc | null | undefined;
  /** Classes `<RichText>` puts on its root next to `os-rich`. */
  className: string | undefined;
  /** Root element `<RichText>` renders. */
  as: "div" | "section" | "article";
  children: ReactNode;
}

export const EditorContext = createContext<EditorHooks | undefined>(undefined);

export function useEditor(): EditorHooks | undefined {
  return useContext(EditorContext);
}

/** The block being rendered and its validated fields (lets `<RichText>` find its field path). */
export const BlockFieldsContext = createContext<
  { block: Block; fields: Record<string, unknown> } | undefined
>(undefined);

/**
 * Where `value` sits inside `fields`, by identity (`items.1.body`). Render functions pass field
 * values straight through, so the object `<RichText>` receives is the one in `fields`.
 */
export function fieldPathOf(
  fields: Record<string, unknown>,
  value: unknown,
  depth = 4,
): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const visit = (node: unknown, path: string[], d: number): string | undefined => {
    if (node === value) return path.join(".");
    if (d === 0 || !node || typeof node !== "object") return undefined;
    // Don't descend into rich text documents themselves.
    if ((node as { type?: unknown }).type === "doc") return undefined;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v && typeof v === "object") {
        const found = visit(v, [...path, k], d - 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const [k, v] of Object.entries(fields)) {
    const found = visit(v, [k], depth);
    if (found) return found;
  }
  return undefined;
}

/** The section currently being rendered (blocks use it for context, e.g. color theme). */
export const SectionContext = createContext<Section | undefined>(undefined);
