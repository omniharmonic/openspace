import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";
import { clamp, decimalsOf, evaluateExpression, roundTo } from "./math";
import "./NumberScrubInput.css";

export interface NumberScrubInputProps {
  /** Accessible label (also the scrub handle's tooltip). */
  label: string;
  /** Visible handle content: a short letter ("W", "X") or an icon. Defaults to the first letter of label. */
  handle?: ReactNode;
  value: number | null;
  /** Called live while scrubbing and on every commit. */
  onChange: (value: number) => void;
  /** Called once when a scrub gesture or text edit finishes (for undo grouping). */
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Pixels of pointer travel per step while scrubbing. */
  pixelsPerStep?: number;
  unit?: string;
  /** Shown when value is null (multi-selection with differing values). */
  mixedLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-describedby"?: string;
}

function format(v: number | null, decimals: number, mixedLabel: string) {
  if (v == null) return mixedLabel;
  return String(roundTo(v, decimals));
}

/**
 * Figma-style number field: drag the handle horizontally to scrub
 * (⇧ ×10, ⌥ ×0.1), type a value or simple math ("24*2"), arrow keys nudge.
 */
export function NumberScrubInput({
  label,
  handle,
  value,
  onChange,
  onChangeEnd,
  min,
  max,
  step = 1,
  pixelsPerStep = 2,
  unit,
  mixedLabel = "Mixed",
  disabled,
  className,
  id,
  "aria-describedby": describedBy,
}: NumberScrubInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const decimals = Math.max(decimalsOf(step), 0);
  const [draft, setDraft] = useState(() => format(value, decimals, mixedLabel));
  const [editing, setEditing] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const scrub = useRef<{ startX: number; startValue: number; last: number; moved: boolean } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set by Escape so the blur that follows doesn't commit the abandoned draft. */
  const cancelled = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(format(value, decimals, mixedLabel));
  }, [value, editing, decimals, mixedLabel]);

  // One extra decimal so ⌥-scrubbing (×0.1) is visible.
  const normalize = (v: number) => roundTo(clamp(v, min, max), Math.min(decimals + 1, 4));

  const commitDraft = () => {
    setEditing(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const parsed = evaluateExpression(draft);
    if (parsed == null) {
      setDraft(format(value, decimals, mixedLabel));
      return;
    }
    const next = roundTo(clamp(parsed, min, max), decimals);
    setDraft(format(next, decimals, mixedLabel));
    if (next !== value) {
      onChange(next);
      onChangeEnd?.(next);
    }
  };

  const nudge = (direction: 1 | -1, e: { shiftKey: boolean; altKey: boolean }) => {
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const base = value ?? min ?? 0;
    const next = roundTo(
      clamp(base + direction * step * mult, min, max),
      Math.max(decimals, e.altKey ? decimals + 1 : decimals),
    );
    onChange(next);
    onChangeEnd?.(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitDraft();
      inputRef.current?.select();
    } else if (e.key === "Escape") {
      cancelled.current = true;
      setEditing(false);
      setDraft(format(value, decimals, mixedLabel));
      inputRef.current?.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setEditing(false);
      nudge(e.key === "ArrowUp" ? 1 : -1, e);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const startValue = value ?? min ?? 0;
    scrub.current = { startX: e.clientX, startValue, last: startValue, moved: false };
    setScrubbing(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    if (!s.moved && Math.abs(dx) < 2) return;
    s.moved = true;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const steps = Math.round(dx / pixelsPerStep);
    const next = normalize(s.startValue + steps * step * mult);
    if (next !== s.last) {
      s.last = next;
      onChange(next);
    }
  };

  const endScrub = (e: PointerEvent<HTMLSpanElement>) => {
    const s = scrub.current;
    if (!s) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    scrub.current = null;
    setScrubbing(false);
    if (s.moved) onChangeEnd?.(s.last);
    else inputRef.current?.focus();
  };

  return (
    <div
      className={cx(
        "st-scrub",
        scrubbing && "st-scrub--scrubbing",
        disabled && "st-scrub--disabled",
        className,
      )}
    >
      <span
        className="st-scrub__handle"
        title={`${label} — drag to adjust`}
        aria-hidden="true"
        data-testid="scrub-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {handle ?? label.charAt(0).toUpperCase()}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        className="st-scrub__input st-num"
        role="spinbutton"
        aria-label={label}
        aria-describedby={describedBy}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={value == null ? mixedLabel : unit ? `${value} ${unit}` : undefined}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={draft}
        onFocus={(e) => {
          setEditing(true);
          if (value == null) setDraft("");
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
      />
      {unit && <span className="st-scrub__unit">{unit}</span>}
    </div>
  );
}
