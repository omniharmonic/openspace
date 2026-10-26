import { matchesShortcut } from "../../ui/shortcuts";
import { deleteItems, duplicateItems, moveItems } from "./model/actions";
import { firstChildOf, locate, parentOf, siblingOf } from "./model/selection";
import type { EditorStore } from "./model/store";
import { canEditInline } from "./text/InlineText";

/** What the shortcut handlers can reach besides the document store. */
export interface ShortcutEnv {
  store: EditorStore;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomTo: (z: number | "fit") => void;
  togglePalette: () => void;
  toggleShortcutsSheet: () => void;
  toggleChrome: () => void;
  openPanel: (index: number) => void;
}

export interface ShortcutDef {
  keys: string[];
  label: string;
  group: "Edit" | "Select" | "View" | "Panels";
  /** Return `false` to let the key through (nothing to act on). */
  run: (env: ShortcutEnv) => unknown;
}

const sel = (env: ShortcutEnv) => env.store.getState();

/** Every editor shortcut; also drives the `?` sheet. Order matters for matching. */
export const EDITOR_SHORTCUTS: ShortcutDef[] = [
  { keys: ["mod+z"], label: "Undo", group: "Edit", run: (e) => sel(e).undo() || true },
  {
    keys: ["shift+mod+z", "mod+y"],
    label: "Redo",
    group: "Edit",
    run: (e) => sel(e).redo() || true,
  },
  {
    keys: ["mod+d"],
    label: "Duplicate",
    group: "Edit",
    run: (e) => {
      const s = sel(e);
      s.run(duplicateItems(s.doc, s.pageId, s.selection));
    },
  },
  {
    keys: ["backspace", "delete"],
    label: "Delete",
    group: "Edit",
    run: (e) => {
      const s = sel(e);
      if (!s.selection.length) return false;
      s.run(deleteItems(s.doc, s.pageId, s.selection));
    },
  },
  {
    keys: ["alt+arrowup"],
    label: "Move up",
    group: "Edit",
    run: (e) => {
      const s = sel(e);
      s.run(moveItems(s.doc, s.pageId, s.selection, -1));
    },
  },
  {
    keys: ["alt+arrowdown"],
    label: "Move down",
    group: "Edit",
    run: (e) => {
      const s = sel(e);
      s.run(moveItems(s.doc, s.pageId, s.selection, 1));
    },
  },
  { keys: ["mod+c"], label: "Copy", group: "Edit", run: () => false },
  { keys: ["mod+x"], label: "Cut", group: "Edit", run: () => false },
  { keys: ["mod+v"], label: "Paste (on any page)", group: "Edit", run: () => false },
  {
    keys: ["arrowup", "arrowleft"],
    label: "Select previous",
    group: "Select",
    run: (e) => step(e, -1),
  },
  {
    keys: ["arrowdown", "arrowright"],
    label: "Select next",
    group: "Select",
    run: (e) => step(e, 1),
  },
  {
    keys: ["enter"],
    label: "Select inside / edit text",
    group: "Select",
    run: (e) => {
      const s = sel(e);
      const item = s.selection.at(-1);
      if (!item || s.selection.length !== 1) return false;
      if (item.kind === "block") {
        const block = locate(s.doc, s.pageId, item)?.block;
        if (block && canEditInline(block)) s.setEditing(block.id);
        return true;
      }
      const child = firstChildOf(s.doc, s.pageId, item);
      if (child) s.select(child);
    },
  },
  {
    keys: ["escape"],
    label: "Select parent",
    group: "Select",
    run: (e) => {
      const s = sel(e);
      if (s.editing) {
        s.setEditing(null);
        return;
      }
      const item = s.selection.at(-1);
      if (!item) return false;
      s.select(parentOf(s.doc, s.pageId, item) ?? null);
    },
  },
  { keys: ["mod+k"], label: "Command palette", group: "View", run: (e) => e.togglePalette() },
  { keys: ["?"], label: "Keyboard shortcuts", group: "View", run: (e) => e.toggleShortcutsSheet() },
  { keys: ["mod+="], label: "Zoom in", group: "View", run: (e) => e.zoomIn() },
  { keys: ["mod+-"], label: "Zoom out", group: "View", run: (e) => e.zoomOut() },
  { keys: ["mod+0"], label: "Zoom to 100%", group: "View", run: (e) => e.zoomTo(1) },
  { keys: ["shift+1"], label: "Zoom to fit", group: "View", run: (e) => e.zoomTo("fit") },
  { keys: ["space"], label: "Hold and drag to pan", group: "View", run: () => false },
  {
    keys: ["mod+backslash"],
    label: "Hide or show panels",
    group: "Panels",
    run: (e) => e.toggleChrome(),
  },
  ...[1, 2, 3, 4, 5].map(
    (n): ShortcutDef => ({
      keys: [`alt+${n}`],
      label: ["Pages", "Layers", "Add section", "Site styles", "Media"][n - 1] as string,
      group: "Panels",
      run: (e) => e.openPanel(n - 1),
    }),
  ),
];

function step(env: ShortcutEnv, dir: -1 | 1) {
  const s = sel(env);
  const item = s.selection.at(-1);
  if (!item) return false;
  const next = siblingOf(s.doc, s.pageId, item, dir);
  if (next) s.select(next);
}

/** Shortcuts that also work while typing in a field (none edit the document). */
const WHILE_TYPING = new Set(["mod+k", "mod+backslash"]);

/** Keys that act on the canvas selection only when focus isn't on some other control. */
const SURFACE_KEYS = new Set([
  "arrowup",
  "arrowleft",
  "arrowdown",
  "arrowright",
  "enter",
  "backspace",
  "delete",
  "escape",
  "space",
]);

const TEXT_INPUTS = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** Like `isTyping`, but works for targets inside the canvas iframe (another JS realm). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { type?: string }) | null;
  if (!el || typeof el !== "object" || !("tagName" in el)) return false;
  const tag = String(el.tagName).toUpperCase();
  if (tag === "INPUT") return TEXT_INPUTS.has(String(el.type ?? "text").toLowerCase());
  return tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/** True when the key event isn't aimed at a control (button, menu, tree) that owns these keys. */
function onSurface(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el !== "object" || !("tagName" in el)) return true;
  const doc = el.ownerDocument;
  if (el === doc?.body || el === doc?.documentElement) return true;
  if (doc?.defaultView && doc.defaultView !== window) return true; // inside the canvas
  return Boolean(el.closest?.("[data-editor-surface]"));
}

/**
 * Handle a keydown from the Studio window or the canvas document. Returns true when the event
 * was consumed (and default-prevented).
 */
export function handleEditorKey(env: ShortcutEnv, event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  const typing = isTypingTarget(event.target) || Boolean(sel(env).editing);
  for (const def of EDITOR_SHORTCUTS) {
    const key = def.keys.find((k) => matchesShortcut(event, k));
    if (!key) continue;
    if (typing && !WHILE_TYPING.has(key)) return false;
    if (SURFACE_KEYS.has(key.split("+").at(-1) ?? "") && !onSurface(event.target)) return false;
    const handled = def.run(env);
    if (handled === false) return false;
    event.preventDefault();
    return true;
  }
  return false;
}
