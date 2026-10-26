import type { SiteDocument } from "@openspace/schema";
import { useEffect } from "react";
import { create } from "zustand";
import type { EditorStore } from "../editor/model/store";
import { type CheckedIssue, countIssues, type IssueCounts, runChecks } from "./model";

/**
 * The open editor's latest Design check results, shared by the panel, the top-bar badge and
 * the publish dialog. Recomputed (debounced) whenever the document changes.
 */
interface DesignCheckState {
  issues: CheckedIssue[];
  counts: IssueCounts;
  /** The document the results are for (null until the first run). */
  checked: SiteDocument | null;
  /** A run is scheduled (the document changed since the last results). */
  stale: boolean;
  set: (doc: SiteDocument, issues: CheckedIssue[]) => void;
  reset: () => void;
}

const EMPTY = countIssues([]);

export const useDesignCheck = create<DesignCheckState>((set) => ({
  issues: [],
  counts: EMPTY,
  checked: null,
  stale: true,
  set: (doc, issues) => set({ issues, counts: countIssues(issues), checked: doc, stale: false }),
  reset: () => set({ issues: [], counts: EMPTY, checked: null, stale: true }),
}));

/** Debounce between the last edit and a re-check. */
export const CHECK_DEBOUNCE_MS = 450;

/** Run the check now (synchronously) for a document, if it isn't the one already checked. */
export function checkNow(doc: SiteDocument): CheckedIssue[] {
  const s = useDesignCheck.getState();
  if (s.checked === doc && !s.stale) return s.issues;
  const issues = runChecks(doc);
  useDesignCheck.getState().set(doc, issues);
  return issues;
}

/**
 * Keep the shared results current for an editing session: one run on open, then one per pause
 * in editing ({@link CHECK_DEBOUNCE_MS}), off the typing path.
 */
export function useDesignCheckRunner(store: EditorStore, debounceMs = CHECK_DEBOUNCE_MS) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      useDesignCheck.setState({ stale: true });
      timer = setTimeout(() => checkNow(store.getState().doc), debounceMs);
    };
    schedule();
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.doc !== prev.doc) schedule();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      useDesignCheck.getState().reset();
    };
  }, [store, debounceMs]);
}
