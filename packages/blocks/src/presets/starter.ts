import { type ColorTheme, newId, type Section, type StackLayout } from "@openspace/schema";

/**
 * Starter looks: the plain stacked layouts Studio's page templates, "+" starters and the 404 page
 * build sections with (no background, padding or grid). They carry a preset ref
 * `starter/stack-<columns>[-center|-start]@1` so the Editor role check (`presetSection`) can tell
 * them from arbitrary styled sections: an editor may add any of these, in any color theme.
 */
export interface StarterLook {
  /** Desktop column spans (phones always stack to one column). */
  columns?: number[];
  theme?: ColorTheme;
  align?: "start" | "center";
}

const REF = /^starter\/stack-((?:[1-9]|1[0-2])(?:-(?:[1-9]|1[0-2])){0,3})(?:-(center|start))?@1$/;

export function starterRef(look: StarterLook = {}): string {
  const cols = (look.columns ?? [12]).join("-");
  return `starter/stack-${cols}${look.align ? `-${look.align}` : ""}@1`;
}

/** The layout and style a starter ref stands for, or undefined if it isn't one. */
export function starterLook(ref: string): { layout: StackLayout; columns: number[] } | undefined {
  const m = REF.exec(ref);
  if (!m) return undefined;
  const columns = (m[1] as string).split("-").map(Number);
  if (columns.reduce((a, b) => a + b, 0) > 12) return undefined;
  const align = m[2] as "center" | "start" | undefined;
  return {
    columns,
    layout: { mode: "stack", columns: { d: columns, m: [12] }, ...(align ? { align } : {}) },
  };
}

/** A starter section (fresh section id; the blocks keep theirs). */
export function starterSection(
  label: string,
  blocks: Section["blocks"],
  look: StarterLook = {},
): Section {
  const ref = starterRef(look);
  const parsed = starterLook(ref);
  if (!parsed) throw new Error(`Not a starter look: ${ref}`);
  return {
    id: newId("sec") as Section["id"],
    label,
    preset: ref,
    layout: parsed.layout,
    style: { colorTheme: look.theme ?? "light" },
    blocks,
  } as Section;
}
