/**
 * Exact position for a block on a grid section (Figma's X / Y / W / H): column, row, width in
 * columns and height in rows on the breakpoint being edited, with the size in pixels the canvas
 * measures. Arrow keys and scrubbing nudge one cell; every change is one `grid.place`.
 */
import type { Block, GridLayout, Section } from "@omniharmonic/openspace-schema";
import { NumberScrubInput } from "../../../ui";
import { useEditorUi } from "../../editor/editor-store";
import { placeCommand } from "../../editor/grid/commands";
import { columnsFor, editBp, rectAt } from "../../editor/grid/model";
import { useDocStore, useDocStoreApi } from "../../editor/model/context";
import { useCanvasDocument } from "../canvasDoc";
import { PanelSection } from "../ui";

export function GridPosition({
  block,
  section,
  disabled,
}: {
  block: Block;
  section: Section & { layout: GridLayout };
  disabled: boolean;
}) {
  const api = useDocStoreApi();
  const pageId = useDocStore((s) => s.pageId);
  useDocStore((s) => s.version);
  const device = useEditorUi((s) => s.breakpoint);
  const frame = useCanvasDocument((s) => s.doc);
  const bp = editBp(device, section.layout);
  const rect = rectAt(section.layout, block.id, bp);
  if (!rect) return null;
  const cols = columnsFor(bp);
  const el = frame?.querySelector(`[data-os-id="${CSS.escape(block.id)}"]`);
  const size = el?.getBoundingClientRect();
  const set = (patch: Partial<typeof rect>, merge: boolean) => {
    const s = api.getState();
    const cmd = placeCommand(
      s.doc,
      pageId,
      section.id,
      [{ id: block.id, rect: { ...rect, ...patch } }],
      bp,
      "Position on grid",
    );
    if (cmd) s.run(cmd, merge ? { mergeKey: `grid-pos:${block.id}:${bp}` } : {});
  };
  const field = (
    key: "x" | "y" | "w" | "h",
    label: string,
    icon: React.ReactNode,
    max: number,
    min = 1,
  ) => (
    <NumberScrubInput
      label={label}
      handle={icon}
      value={rect[key]}
      min={min}
      max={max}
      pixelsPerStep={8}
      disabled={disabled}
      onChange={(v) => set({ [key]: Math.round(v) }, true)}
    />
  );
  return (
    <PanelSection title="Position">
      <div className="st-gridpos">
        {field("x", "Column", "X", cols - rect.w + 1)}
        {field("y", "Row", "Y", 400)}
        {field("w", "Width in columns", "W", cols - rect.x + 1)}
        {field("h", "Height in rows", "H", 400)}
      </div>
      <p className="st-ip-row__hint">
        Column {rect.x} of {cols}, row {rect.y}
        {size ? ` · ${Math.round(size.width)} × ${Math.round(size.height)} px` : ""}. Drag on the
        canvas to snap; arrow keys nudge one cell (⇧ four).
      </p>
    </PanelSection>
  );
}
