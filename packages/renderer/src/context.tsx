import type { Block, Page, Section, SiteDocument } from "@openspace/schema";
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
}

export const EditorContext = createContext<EditorHooks | undefined>(undefined);

export function useEditor(): EditorHooks | undefined {
  return useContext(EditorContext);
}

/** The section currently being rendered (blocks use it for context, e.g. color theme). */
export const SectionContext = createContext<Section | undefined>(undefined);
