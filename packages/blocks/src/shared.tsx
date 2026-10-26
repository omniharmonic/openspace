import { resolveImage, useImageMap, useRenderContext } from "@openspace/renderer";
import {
  type BlockStyle,
  f,
  type HeadingPreset,
  type ImageValue,
  type InlineNode,
  type ParagraphPreset,
  type RichTextDoc,
  type TypePreset,
} from "@openspace/schema";

/** Helpers shared by the block library. */

// --- rich text builders (defaults and tests) ----------------------------------------------------

export type Inline = string | InlineNode;
const inline = (parts: Inline[]): InlineNode[] =>
  parts.map((p) => (typeof p === "string" ? { type: "text", text: p } : p));

export const rt = {
  doc: (...content: RichTextDoc["content"]): RichTextDoc => ({ type: "doc", content }),
  p: (text: Inline | Inline[], preset?: ParagraphPreset): RichTextDoc["content"][number] => ({
    type: "paragraph",
    ...(preset ? { attrs: { preset } } : {}),
    content: inline(Array.isArray(text) ? text : [text]),
  }),
  h: (
    level: 1 | 2 | 3 | 4,
    text: string,
    preset?: HeadingPreset,
  ): RichTextDoc["content"][number] => ({
    type: "heading",
    attrs: preset ? { level, preset } : { level },
    content: [{ type: "text", text }],
  }),
  ul: (...items: string[]): RichTextDoc["content"][number] => ({
    type: "bulletList",
    content: items.map((text) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  }),
  bold: (text: string): InlineNode => ({ type: "text", text, marks: [{ type: "bold" }] }),
  italic: (text: string): InlineNode => ({ type: "text", text, marks: [{ type: "italic" }] }),
  link: (text: string, href: string): InlineNode => ({
    type: "text",
    text,
    marks: [{ type: "link", attrs: { href } }],
  }),
};

// --- style helpers ------------------------------------------------------------------------------

/** Class for a block's `typography.<slot>` override, else the given default preset. */
export function typo(style: BlockStyle | undefined, slot: string, fallback: TypePreset): string {
  return `os-type-${style?.typography?.[slot] ?? fallback}`;
}

// --- shared field builders ------------------------------------------------------------------------

export const ASPECT_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "1:1", label: "Square 1:1" },
  { value: "4:5", label: "Portrait 4:5" },
  { value: "2:3", label: "Tall 2:3" },
  { value: "3:2", label: "Landscape 3:2" },
  { value: "16:9", label: "Wide 16:9" },
  { value: "21:9", label: "Cinematic 21:9" },
] as const;
export type AspectOption = (typeof ASPECT_OPTIONS)[number]["value"];

export const aspectField = (fallback: AspectOption, help = "Crop shape for the image") =>
  f.select({ options: ASPECT_OPTIONS, default: fallback, label: "Aspect ratio", help });

// --- hub / site helpers ---------------------------------------------------------------------------

/** Hub origin + site id for public endpoints (`/f/…`, `/n/…`). */
export function useHub(): { hub: string; siteId: string } {
  const ctx = useRenderContext();
  const hub = (ctx.hubUrl ?? ctx.doc?.config.hub ?? "").replace(/\/+$/, "");
  return { hub, siteId: ctx.doc?.config.siteId ?? "" };
}

/** The owner's contact email, from the site's `email` social profile (used in form fallbacks). */
export function useOwnerEmail(): string | undefined {
  const { doc } = useRenderContext();
  const profile = doc?.site.social?.find((s) => s.network === "email");
  return profile?.url.replace(/^mailto:/, "") || undefined;
}

/** Full-size URL of an image (lightbox targets, share images). */
export function useImageUrl(): (image: ImageValue) => string {
  const ctx = useRenderContext();
  const imageMap = useImageMap();
  return (image) =>
    resolveImage(image.src, {
      imageMap,
      doc: ctx.doc,
      basePath: ctx.basePath,
      width: image.width,
      height: image.height,
    }).src;
}

/** `blk_abc` + `q1` → `blk_abc-q1` (stable element ids inside a block). */
export const sub = (id: string, part: string | number) => `${id}-${part}`;

// --- demo photography (Unsplash; real photographs, licensed for free use) ----------------------

const unsplash = (id: string, alt: string, width: number, height: number): ImageValue => ({
  src: `https://images.unsplash.com/photo-${id}?w=2400&q=80`,
  alt,
  width,
  height,
});

export const DEMO = {
  yogaDeck: unsplash(
    "1506126613408-eca07ce68773",
    "A woman meditating cross-legged on a wooden deck at sunrise",
    2400,
    2796,
  ),
  hills: unsplash(
    "1501854140801-50d01698950b",
    "Rolling green hills seen from above, ridges catching the light",
    2400,
    1428,
  ),
  forest: unsplash(
    "1441974231531-c6227db76b6e",
    "Sunlight falling through tall trees onto a forest path",
    2400,
    1600,
  ),
  cliffs: unsplash(
    "1470071459604-3b5ec3a7fe05",
    "Mist rolling over green cliffs at sunrise",
    2400,
    1428,
  ),
  coffeeCheers: unsplash(
    "1495474472287-4d71bcdd2085",
    "Four friends raising lattes over a wooden table",
    2400,
    1600,
  ),
  dining: unsplash(
    "1517248135467-4c7edcad34c4",
    "A warm, dimly lit restaurant dining room before service",
    2400,
    1600,
  ),
  dinner: unsplash(
    "1414235077428-338989a2e8c0",
    "A plated dish on a candlelit dinner table set for friends",
    2400,
    1600,
  ),
  portraitLake: unsplash(
    "1438761681033-6461ffad8d80",
    "Portrait of a woman with short auburn hair beside a lake",
    2400,
    1600,
  ),
  portraitDaniel: unsplash(
    "1500648767791-00dcc994a43e",
    "Portrait of a man in a grey sweater, smiling softly",
    1600,
    2400,
  ),
  portraitAna: unsplash(
    "1494790108377-be9c29b29330",
    "Portrait of a woman in a red sweater, laughing",
    1600,
    2400,
  ),
  portraitSam: unsplash(
    "1507003211169-0a1dd7228f2d",
    "Portrait of a smiling man in a white t-shirt",
    1600,
    2400,
  ),
  pilates: unsplash(
    "1518611012118-696072aa579a",
    "Two women stretching on mats in a bright studio",
    2400,
    1600,
  ),
  poppies: unsplash(
    "1490750967868-88aa4486c946",
    "Orange poppies against a clear blue sky",
    2400,
    1600,
  ),
  beachPose: unsplash(
    "1544367567-0f2fcb009e0b",
    "A person holding a yoga pose on the beach at dusk",
    2400,
    1512,
  ),
  beachClass: unsplash(
    "1545205597-3d9d02c29597",
    "A small group practising yoga together on a misty beach",
    2400,
    1600,
  ),
  bridge: unsplash(
    "1447752875215-b2761acb3c5d",
    "A wooden footbridge leading into a dense green forest",
    2400,
    1600,
  ),
  meadow: unsplash(
    "1465146344425-f00d5f5c8f07",
    "Wild red poppies scattered through a summer meadow",
    2400,
    1584,
  ),
  coffeeTable: unsplash(
    "1509042239860-f550ce710b93",
    "Two cappuccinos with latte art beside potted herbs",
    1600,
    2400,
  ),
  skincare: unsplash(
    "1556228578-8c89e6adf883",
    "A skincare tube resting on sand among dried flowers",
    1600,
    2400,
  ),
  livingRoom: unsplash(
    "1524758631624-e2822e304c36",
    "A bright, airy lounge with pale chairs and a reading lamp",
    2400,
    1600,
  ),
} as const;
