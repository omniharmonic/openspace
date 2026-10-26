import { blocksRegistry } from "@openspace/blocks";
import { invert, type Op, type OpBody, type OpIssue, stamp, validate } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Command } from "./actions";
import { locate, type SelItem, sameItem } from "./selection";

/**
 * The editor's document store. Every change to the document is a list of `@openspace/ops`
 * operations: validated, applied, and recorded with its inverse so undo/redo are just more ops.
 *
 * Sync seam (Task 23): `onLocalOps` reports every op this client applies (edits, undos and
 * redos alike) so a draft-room client can send them; `applyRemoteOps` applies ops that came
 * from elsewhere without touching this client's undo history.
 */

/** One undo/redo step: the ops that revert it, plus the selection to restore. */
interface HistoryEntry {
  revert: Op[];
  label: string;
  selection: SelItem[];
  /** Consecutive commits with the same key inside {@link MERGE_WINDOW_MS} merge (typing). */
  mergeKey?: string;
  at: number;
}

/** Typing pauses longer than this start a new undo step. */
export const MERGE_WINDOW_MS = 1500;

export interface CommitOptions {
  label?: string;
  mergeKey?: string;
  /** Selection after the change (defaults to the current one, pruned of deleted items). */
  select?: SelItem[];
}

export type CommitResult = { ok: true; ops: Op[] } | { ok: false; errors: OpIssue[] };

export type LocalOpsListener = (
  ops: Op[],
  info: { kind: "edit" | "undo" | "redo"; label: string },
) => void;

export interface EditorDocState {
  doc: SiteDocument;
  pageId: string;
  actor: string;
  selection: SelItem[];
  hover: SelItem | null;
  /** Block whose text is being edited inline. */
  editing: string | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Bumps on every document change (cheap change detection for the canvas). */
  version: number;

  setPage: (pageId: string) => void;
  select: (item: SelItem | null, options?: { additive?: boolean }) => void;
  setSelection: (items: SelItem[]) => void;
  setHover: (item: SelItem | null) => void;
  setEditing: (blockId: string | null) => void;
  commit: (bodies: OpBody[], options?: CommitOptions) => CommitResult;
  run: (command: Command | null, options?: Omit<CommitOptions, "select" | "label">) => CommitResult;
  undo: () => boolean;
  redo: () => boolean;
  /** Close the current undo step so the next typing burst starts a new one. */
  sealHistory: () => void;
  onLocalOps: (listener: LocalOpsListener) => () => void;
  applyRemoteOps: (ops: readonly Op[]) => {
    applied: Op[];
    rejected: Array<{ op: Op; errors: OpIssue[] }>;
  };
  replaceDocument: (doc: SiteDocument) => void;
}

export type EditorStore = StoreApi<EditorDocState>;

export interface CreateEditorStoreOptions {
  doc: SiteDocument;
  pageId?: string;
  actor?: string;
  now?: () => number;
}

let opCounter = 0;

/** First page in navigation order (falls back to the first page in the document). */
export function homePageId(doc: SiteDocument): string {
  const home = Object.values(doc.pages).find((p) => p.slug === "");
  return home?.id ?? Object.keys(doc.pages)[0] ?? "";
}

export function createEditorStore(options: CreateEditorStoreOptions): EditorStore {
  const now = options.now ?? Date.now;
  const actor = options.actor ?? "user:local";
  const listeners = new Set<LocalOpsListener>();
  const registry = blocksRegistry();

  /** Validate and apply ops in order (all or nothing). Returns the stamped ops and their reverts. */
  const runOps = (
    doc: SiteDocument,
    bodies: readonly (OpBody | Op)[],
  ):
    | { ok: true; doc: SiteDocument; ops: Op[]; revert: Op[] }
    | { ok: false; errors: OpIssue[] } => {
    let cur = doc;
    const ops: Op[] = [];
    const inverses: Op[] = [];
    for (const body of bodies) {
      const op = stamp(body as OpBody<Op>, {
        id: `${actor}:${now().toString(36)}:${(++opCounter).toString(36)}`,
        actor,
        ts: now(),
      });
      let inv: Op;
      try {
        inv = invert(cur, op);
      } catch (err) {
        return {
          ok: false,
          errors: [{ path: [], message: String((err as Error).message ?? err) }],
        };
      }
      const r = validate(cur, op, { registry, trusted: true });
      if (!r.ok) return { ok: false, errors: r.errors };
      cur = r.doc;
      ops.push(op);
      inverses.push(inv);
    }
    return { ok: true, doc: cur, ops, revert: inverses.reverse() };
  };

  const prune = (doc: SiteDocument, pageId: string, items: SelItem[]) =>
    items.filter((i) => locate(doc, pageId, i));

  const emit = (ops: Op[], kind: "edit" | "undo" | "redo", label: string) => {
    if (!ops.length) return;
    for (const l of listeners) l(ops, { kind, label });
  };

  const store = createStore<EditorDocState>((set, get) => ({
    doc: options.doc,
    pageId: options.pageId ?? homePageId(options.doc),
    actor,
    selection: [],
    hover: null,
    editing: null,
    undoStack: [],
    redoStack: [],
    version: 0,

    setPage: (pageId) => {
      if (!get().doc.pages[pageId as keyof SiteDocument["pages"]]) return;
      set({ pageId, selection: [], hover: null, editing: null });
    },

    select: (item, opts = {}) => {
      const { selection, editing } = get();
      if (!item) {
        set({ selection: [], editing: null });
        return;
      }
      let next: SelItem[];
      if (opts.additive && selection.length && selection[0]?.kind === item.kind) {
        next = selection.some((s) => sameItem(s, item))
          ? selection.filter((s) => !sameItem(s, item))
          : [...selection, item];
      } else next = [item];
      set({
        selection: next,
        editing: editing && next.length === 1 && next[0]?.id === editing ? editing : null,
      });
    },

    setSelection: (items) => set({ selection: items, editing: null }),
    setHover: (hover) => {
      if (!sameItem(get().hover, hover) && (get().hover || hover)) set({ hover });
    },
    setEditing: (blockId) => {
      if (blockId) set({ editing: blockId, selection: [{ kind: "block", id: blockId }] });
      else {
        get().sealHistory();
        set({ editing: null });
      }
    },

    commit: (bodies, opts = {}) => {
      if (!bodies.length) return { ok: true, ops: [] };
      const s = get();
      const r = runOps(s.doc, bodies);
      if (!r.ok) return r;
      const label = opts.label ?? "Edit";
      const top = s.undoStack[s.undoStack.length - 1];
      const t = now();
      const merge =
        opts.mergeKey !== undefined &&
        top?.mergeKey === opts.mergeKey &&
        t - top.at <= MERGE_WINDOW_MS &&
        s.redoStack.length === 0;
      const entry: HistoryEntry = merge
        ? { ...(top as HistoryEntry), at: t }
        : { revert: r.revert, label, selection: s.selection, mergeKey: opts.mergeKey, at: t };
      const undoStack = merge ? [...s.undoStack.slice(0, -1), entry] : [...s.undoStack, entry];
      const selection = prune(r.doc, s.pageId, opts.select ?? s.selection);
      set({
        doc: r.doc,
        undoStack,
        redoStack: [],
        selection,
        editing:
          s.editing && locate(r.doc, s.pageId, { kind: "block", id: s.editing }) ? s.editing : null,
        hover: s.hover && locate(r.doc, s.pageId, s.hover) ? s.hover : null,
        version: s.version + 1,
      });
      emit(r.ops, "edit", label);
      return { ok: true, ops: r.ops };
    },

    run: (command, opts = {}) => {
      if (!command) return { ok: true, ops: [] };
      return get().commit(command.bodies, {
        ...opts,
        label: command.label,
        select: command.select,
      });
    },

    undo: () => {
      const s = get();
      // Skip steps that no longer apply (e.g. a collaborator deleted what they touched).
      for (let i = s.undoStack.length - 1; i >= 0; i--) {
        const entry = s.undoStack[i] as HistoryEntry;
        const r = runOps(s.doc, entry.revert);
        if (!r.ok) continue;
        set({
          doc: r.doc,
          undoStack: s.undoStack.slice(0, i),
          redoStack: [
            ...s.redoStack,
            { revert: r.revert, label: entry.label, selection: s.selection, at: now() },
          ],
          selection: prune(r.doc, s.pageId, entry.selection),
          editing: null,
          version: s.version + 1,
        });
        emit(r.ops, "undo", entry.label);
        return true;
      }
      if (s.undoStack.length) set({ undoStack: [] });
      return false;
    },

    redo: () => {
      const s = get();
      for (let i = s.redoStack.length - 1; i >= 0; i--) {
        const entry = s.redoStack[i] as HistoryEntry;
        const r = runOps(s.doc, entry.revert);
        if (!r.ok) continue;
        set({
          doc: r.doc,
          redoStack: s.redoStack.slice(0, i),
          undoStack: [
            ...s.undoStack,
            { revert: r.revert, label: entry.label, selection: s.selection, at: now() },
          ],
          selection: prune(r.doc, s.pageId, entry.selection),
          editing: null,
          version: s.version + 1,
        });
        emit(r.ops, "redo", entry.label);
        return true;
      }
      if (s.redoStack.length) set({ redoStack: [] });
      return false;
    },

    sealHistory: () => {
      const s = get();
      const top = s.undoStack[s.undoStack.length - 1];
      if (top?.mergeKey)
        set({ undoStack: [...s.undoStack.slice(0, -1), { ...top, mergeKey: undefined }] });
    },

    onLocalOps: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    applyRemoteOps: (incoming) => {
      const applied: Op[] = [];
      const rejected: Array<{ op: Op; errors: OpIssue[] }> = [];
      let doc = get().doc;
      for (const op of incoming) {
        const r = validate(doc, op, { registry });
        if (r.ok) {
          doc = r.doc;
          applied.push(op);
        } else rejected.push({ op, errors: r.errors });
      }
      if (applied.length) {
        const s = get();
        set({
          doc,
          selection: prune(doc, s.pageId, s.selection),
          hover: s.hover && locate(doc, s.pageId, s.hover) ? s.hover : null,
          editing:
            s.editing && locate(doc, s.pageId, { kind: "block", id: s.editing }) ? s.editing : null,
          pageId: doc.pages[s.pageId as keyof SiteDocument["pages"]] ? s.pageId : homePageId(doc),
          version: s.version + 1,
        });
      }
      return { applied, rejected };
    },

    replaceDocument: (doc) => {
      const s = get();
      set({
        doc,
        pageId: doc.pages[s.pageId as keyof SiteDocument["pages"]] ? s.pageId : homePageId(doc),
        selection: prune(doc, s.pageId, s.selection),
        hover: null,
        editing: null,
        undoStack: [],
        redoStack: [],
        version: s.version + 1,
      });
    },
  }));
  return store;
}
