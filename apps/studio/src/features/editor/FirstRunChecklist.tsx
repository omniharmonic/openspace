import { ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { cx, IconButton } from "../../ui";
import "./FirstRunChecklist.css";

export const CHECKLIST_ITEMS = [
  { id: "logo", label: "Replace the logo" },
  { id: "photo", label: "Change the main photo" },
  { id: "headline", label: "Edit the headline" },
  { id: "domain", label: "Connect your domain" },
  { id: "ai", label: "Connect your AI" },
] as const;

export type ChecklistItemId = (typeof CHECKLIST_ITEMS)[number]["id"];

interface ChecklistState {
  done: ChecklistItemId[];
  dismissed: boolean;
  collapsed: boolean;
}

const storageKey = (siteId: string) => `openspace.checklist.${siteId}`;

export function readChecklist(siteId: string): ChecklistState {
  try {
    const raw = localStorage.getItem(storageKey(siteId));
    if (raw)
      return {
        done: [],
        dismissed: false,
        collapsed: false,
        ...(JSON.parse(raw) as Partial<ChecklistState>),
      };
  } catch {
    // ignore
  }
  return { done: [], dismissed: false, collapsed: false };
}

function writeChecklist(siteId: string, state: ChecklistState) {
  try {
    localStorage.setItem(storageKey(siteId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Shared state hook so the palette can reopen a dismissed checklist. */
export function useChecklist(siteId: string) {
  const [state, setState] = useState(() => readChecklist(siteId));
  const update = (patch: Partial<ChecklistState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      writeChecklist(siteId, next);
      return next;
    });
  return {
    state,
    toggle: (id: ChecklistItemId) =>
      update({
        done: state.done.includes(id) ? state.done.filter((d) => d !== id) : [...state.done, id],
      }),
    /** Tick an item (no-op when already done); used when the editor sees the step happen. */
    complete: (id: ChecklistItemId) =>
      setState((s) => {
        if (s.done.includes(id)) return s;
        const next = { ...s, done: [...s.done, id] };
        writeChecklist(siteId, next);
        return next;
      }),
    dismiss: () => update({ dismissed: true }),
    show: () => update({ dismissed: false, collapsed: false }),
    setCollapsed: (collapsed: boolean) => update({ collapsed }),
  };
}

export interface FirstRunChecklistProps {
  checklist: ReturnType<typeof useChecklist>;
}

/** Dismissible first-run checklist (PRD §4.1 step 7). */
export function FirstRunChecklist({ checklist }: FirstRunChecklistProps) {
  const { state, toggle, dismiss, setCollapsed } = checklist;
  if (state.dismissed) return null;
  const count = state.done.length;
  const total = CHECKLIST_ITEMS.length;
  const complete = count === total;
  return (
    <section
      className={cx("st-checklist", state.collapsed && "st-checklist--collapsed")}
      aria-labelledby="st-checklist-title"
    >
      <header className="st-checklist__head">
        <button
          type="button"
          className="st-checklist__toggle"
          aria-expanded={!state.collapsed}
          onClick={() => setCollapsed(!state.collapsed)}
        >
          <span id="st-checklist-title" className="st-checklist__title">
            {complete ? "Your site is ready" : "Get your site ready"}
          </span>
          <span className="st-checklist__count st-num">
            {count} of {total}
          </span>
          <ChevronDown className="st-checklist__chevron" aria-hidden="true" />
        </button>
        <IconButton label="Hide checklist" icon={<X />} size="sm" onClick={dismiss} />
      </header>
      <div
        className="st-checklist__meter"
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
      >
        <span style={{ width: `${(count / total) * 100}%` }} />
      </div>
      {!state.collapsed && (
        <ul className="st-checklist__list">
          {CHECKLIST_ITEMS.map((item) => {
            const done = state.done.includes(item.id);
            return (
              <li
                key={item.id}
                className={cx("st-checklist__item", done && "st-checklist__item--done")}
              >
                <label className="st-checklist__label">
                  <input
                    type="checkbox"
                    className="st-checklist__box"
                    checked={done}
                    onChange={() => toggle(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
