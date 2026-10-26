import { useSiteRoleStore } from "../../inspector/env";
import { useEditorUi } from "../editor-store";
import { locate } from "../model/selection";
import type { EditorStore } from "../model/store";
import { gridCaps, isPhoneViewport } from "./caps";
import { gridSelection, nudgeCommand, zOrderCommand } from "./commands";
import { gridController } from "./controller";
import { editBp, type ZAction } from "./model";

/**
 * Keyboard grid editing for the shortcut table: arrows nudge the selected grid blocks one cell
 * (⇧ four), ⌘] ⌘[ ⌥⌘] ⌥⌘[ change their stacking order. Each returns false when it doesn't
 * apply (nothing on a grid selected, no permission, a phone), so the key falls through to
 * selection navigation.
 */

function env(store: EditorStore) {
  const ctx = gridController.ctx?.store === store ? gridController.ctx : null;
  return {
    role: ctx?.role ?? useSiteRoleStore.getState().role,
    device: ctx?.device ?? useEditorUi.getState().breakpoint,
    phone: ctx?.phone ?? isPhoneViewport(),
  };
}

function target(store: EditorStore) {
  const s = store.getState();
  if (s.editing) return null;
  const sel = gridSelection(s.doc, s.pageId, s.selection);
  // Only when every selected item is a block of that one grid section.
  if (!sel || sel.ids.length !== s.selection.length) return null;
  const e = env(store);
  if (e.phone) return null;
  const section = locate(s.doc, s.pageId, { kind: "section", id: sel.section.id })?.section;
  if (!gridCaps(e.role, section).edit) return null;
  return { s, sel, bp: editBp(e.device, sel.section.layout) };
}

export function gridNudge(store: EditorStore, dc: number, dr: number): boolean {
  const t = target(store);
  if (!t) return false;
  const cmd = nudgeCommand(t.s.doc, t.s.pageId, t.s.selection, dc, dr, t.bp);
  // A held arrow key is one undo step.
  if (cmd) t.s.run(cmd, { mergeKey: `grid-nudge:${t.sel.ids.join(",")}:${t.bp}` });
  return true;
}

export function gridZOrder(store: EditorStore, action: ZAction): boolean {
  const t = target(store);
  if (!t) return false;
  const cmd = zOrderCommand(t.s.doc, t.s.pageId, t.s.selection, action, t.bp);
  if (cmd) t.s.run(cmd);
  return true;
}
