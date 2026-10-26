import type {
  BooleanFieldMeta,
  ColorFieldMeta,
  NumberFieldMeta,
  SelectFieldMeta,
  TextFieldMeta,
} from "@openspace/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { ColorPicker, Input, NumberScrubInput, Toggle } from "../../../ui";
import { fromPickerValue, paletteTokens, toPickerValue } from "../model/colors";
import { TokenPicker } from "../ui";
import { type ControlProps, useFieldsContext } from "./types";

/** Typing commits after this pause; the burst becomes one undo step. */
export const FIELD_COMMIT_MS = 250;

/**
 * Local draft for typed values: commits after a pause and on blur, follows outside changes
 * (undo, collaborators) while not being edited, and keeps the error from the last commit.
 */
export function useDraft<V>(
  value: V | undefined,
  commit: (v: V | undefined) => string | null,
  equals: (a: V | undefined, b: V | undefined) => boolean = Object.is,
) {
  const [draft, setDraft] = useState<V | undefined>(value);
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(draft);
  latest.current = draft;
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!editing.current && !equals(value, latest.current)) {
      setDraft(value);
      setError(null);
    }
  }, [value, equals]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (equals(latest.current, value)) {
      setError(null);
      return;
    }
    setError(commitRef.current(latest.current));
  };

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return {
    draft,
    error,
    setError,
    change: (next: V | undefined) => {
      editing.current = true;
      setDraft(next);
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, FIELD_COMMIT_MS);
    },
    flush,
    blur: () => {
      flush();
      editing.current = false;
    },
  };
}

export function TextControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<TextFieldMeta, string> & { onError?: (e: string | null) => void }) {
  const d = useDraft<string>(value, (v) => {
    const text = v ?? "";
    if (!text.trim() && !meta.optional) return "This can’t be empty.";
    return onChange(text === "" && meta.optional ? undefined : text, { merge: true });
  });
  const text = d.draft ?? "";
  const over = meta.maxLength !== undefined && text.length > meta.maxLength;
  const common = {
    id,
    value: text,
    disabled,
    placeholder: meta.placeholder,
    "aria-invalid": d.error ? true : undefined,
    "aria-describedby": d.error ? `${id}-error` : undefined,
    onBlur: d.blur,
  };
  return (
    <div className="st-ip-text">
      {meta.multiline ? (
        <textarea
          {...common}
          className="st-ip-textarea"
          aria-label={label}
          rows={3}
          onChange={(e) => d.change(e.target.value)}
        />
      ) : (
        <Input
          {...common}
          size="sm"
          aria-label={label}
          onChange={(e) => d.change(e.target.value.replace(/[\r\n]+/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter") d.flush();
            if (e.key === "Escape") {
              d.change(value);
              e.currentTarget.blur();
            }
          }}
        />
      )}
      {(meta.maxLength !== undefined || d.error) && (
        <div className="st-ip-text__foot">
          {d.error ? (
            <span id={`${id}-error`} className="st-ip-row__error" role="alert">
              {d.error}
            </span>
          ) : (
            <span />
          )}
          {meta.maxLength !== undefined && (
            <span className="st-ip-count" data-over={over ? "" : undefined}>
              {text.length}/{meta.maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function NumberControl({
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<NumberFieldMeta, number>) {
  const [error, setError] = useState<string | null>(null);
  const clamp = (n: number) => {
    let v = meta.integer ? Math.round(n) : n;
    if (meta.min !== undefined) v = Math.max(meta.min, v);
    if (meta.max !== undefined) v = Math.min(meta.max, v);
    return v;
  };
  return (
    <div className="st-ip-text">
      <NumberScrubInput
        label={label}
        value={value ?? null}
        mixedLabel="—"
        min={meta.min}
        max={meta.max}
        step={meta.step ?? (meta.integer ? 1 : 1)}
        unit={meta.unit}
        disabled={disabled}
        onChange={(n) => setError(onChange(clamp(n), { merge: true }))}
      />
      {error && (
        <span className="st-ip-row__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function BooleanControl({
  id,
  value,
  onChange,
  disabled,
  label,
}: ControlProps<BooleanFieldMeta, boolean>) {
  return (
    <div className="st-ip-fixed">
      <Toggle
        id={id}
        size="sm"
        checked={value === true}
        disabled={disabled}
        aria-label={label}
        onCheckedChange={(c) => onChange(c)}
      />
    </div>
  );
}

export function SelectControl({
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<SelectFieldMeta, string>) {
  const short =
    meta.display === "segmented" ||
    meta.display === "radio" ||
    (meta.display === undefined &&
      meta.options.length <= 3 &&
      meta.options.every((o) => o.label.length <= 9));
  return (
    <TokenPicker<string>
      label={label}
      value={value}
      options={meta.options}
      segmented={short && !meta.optional}
      disabled={disabled}
      {...(meta.optional ? { defaultLabel: "None" } : {})}
      onChange={(v) => onChange(v)}
    />
  );
}

export function ColorControl({
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<ColorFieldMeta, string>) {
  const { doc, caps } = useFieldsContext();
  const tokens = useMemo(() => paletteTokens(doc.styles), [doc.styles]);
  return (
    <ColorPicker
      label={label}
      tokens={tokens}
      value={toPickerValue(value)}
      allowExact={meta.allowCustom && caps.exact}
      disabled={disabled}
      onChange={(v) => onChange(fromPickerValue(v), { merge: true })}
    />
  );
}
