import type { FieldKind, Section } from "@omniharmonic/openspace-schema";

/**
 * What the signed-in person may change from the inspector, mirroring the Hub's role rules
 * (`transformForRole` in `@omniharmonic/openspace-ops`), so controls that would be refused are never offered:
 *
 * - **owner / designer**: everything, including exact values (the Designer escape hatch).
 * - **editor**: content of unlocked sections; block styles on unlocked sections; on locked
 *   sections only text and image fields. Never site styles or section layout/style.
 * - **contributor**: nothing on pages (they draft collection items).
 */
export type Role = "owner" | "designer" | "editor" | "contributor";

const CONTENT_KINDS = new Set<FieldKind>(["text", "richText", "image"]);

export function asRole(value: string | undefined | null): Role {
  return value === "owner" || value === "designer" || value === "editor" ? value : "contributor";
}

export const isDesigner = (role: Role) => role === "owner" || role === "designer";

export interface Capabilities {
  /** Exact values (CSS colors, pixel heights, DTCG overrides). */
  exact: boolean;
  /** Site Styles (`styles.patch`). */
  siteStyles: boolean;
  /** Section layout and style (`section.update` of `layout`/`style`). */
  sectionDesign: boolean;
  /** Block variant/style/column/label/hidden. */
  blockDesign: boolean;
  /** A field of this kind may be edited. */
  field: (kind: FieldKind) => boolean;
  /** Blocks may be added, moved or removed in this section. */
  structure: boolean;
  /** Why something is unavailable, for a one-line note in the panel. */
  note?: string;
}

/** May this role add page sections (presets) at all? Contributors write posts, not pages. */
export const canAddSections = (role: Role) => role !== "contributor";

/** Capabilities for `role` on content inside `section` (or site-wide when absent). */
export function capabilities(
  role: Role,
  section?: { locked?: boolean | undefined; layout?: Pick<Section["layout"], "mode"> },
): Capabilities {
  if (isDesigner(role)) {
    return {
      exact: true,
      siteStyles: true,
      sectionDesign: true,
      blockDesign: true,
      field: () => true,
      structure: true,
    };
  }
  if (role === "editor") {
    const locked = section?.locked === true;
    return {
      exact: false,
      siteStyles: false,
      sectionDesign: false,
      blockDesign: !locked,
      field: (kind) => !locked || CONTENT_KINDS.has(kind),
      // Adding, moving or removing blocks in a grid places them, which only designers may do.
      structure: !locked && section?.layout?.mode !== "grid",
      note: locked
        ? "This section is locked. You can change its words and images."
        : "Layout and site styles are set by the site’s designer.",
    };
  }
  return {
    exact: false,
    siteStyles: false,
    sectionDesign: false,
    blockDesign: false,
    field: () => false,
    structure: false,
    note: "Contributors write posts and events. Ask an editor to change pages.",
  };
}
