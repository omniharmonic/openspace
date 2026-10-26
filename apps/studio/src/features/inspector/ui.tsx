import { ChevronRight, RotateCcw } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { cx, Segmented, Select, Tooltip } from "../../ui";
import { BP_LABEL, type Bp } from "./model/responsive";
import "./inspector.css";

/**
 * Inspector building blocks: collapsible sections, labelled property rows, override dots and
 * token pickers. Dense Figma-style chrome: 13px type, 28px controls, 1px hairlines.
 */

export function PanelSection({
  title,
  children,
  defaultOpen = true,
  actions,
  count,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="st-ip-sec" data-open={open ? "" : undefined}>
      <div className="st-ip-sec__head">
        <button
          type="button"
          className="st-ip-sec__toggle"
          data-ip-nav=""
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight className="st-ip-sec__chev" aria-hidden="true" />
          <span className="st-ip-sec__title">{title}</span>
          {count !== undefined && <span className="st-ip-sec__count">{count}</span>}
        </button>
        {actions && <div className="st-ip-sec__actions">{actions}</div>}
      </div>
      {open && (
        <div className="st-ip-sec__body" id={id}>
          {children}
        </div>
      )}
    </section>
  );
}

/** A breakpoint override marker (FR-15): filled when this breakpoint has its own value. */
export function OverrideDot({ bps }: { bps: Bp[] }) {
  if (!bps.length) return null;
  const label = `Changed on ${bps.map((b) => BP_LABEL[b].toLowerCase()).join(" and ")}`;
  return (
    <Tooltip content={label}>
      <span className="st-ip-dots" role="img" aria-label={label}>
        {bps.map((b) => (
          <span key={b} className="st-ip-dot" data-bp={b} />
        ))}
      </span>
    </Tooltip>
  );
}

export interface PropRowProps {
  label: string;
  /** For `<label htmlFor>`; omit when the control labels itself (segmented, swatches). */
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Breakpoints that override this value (dots next to the label). */
  overrides?: Bp[];
  /** Shown when the current breakpoint overrides the value: reset it to the inherited value. */
  onReset?: () => void;
  resetLabel?: string;
  stacked?: boolean;
}

export function PropRow({
  label,
  htmlFor,
  children,
  hint,
  error,
  overrides = [],
  onReset,
  resetLabel,
  stacked,
}: PropRowProps) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cx("st-ip-row", stacked && "st-ip-row--stacked")}>
      <div className="st-ip-row__label">
        <Label {...(htmlFor ? { htmlFor } : {})} className="st-ip-row__text">
          {label}
        </Label>
        <OverrideDot bps={overrides} />
        {onReset && (
          <Tooltip content={resetLabel ?? "Reset"}>
            <button
              type="button"
              className="st-ip-row__reset"
              aria-label={resetLabel ?? `Reset ${label.toLowerCase()}`}
              onClick={onReset}
            >
              <RotateCcw aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="st-ip-row__control">{children}</div>
      {error ? (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="st-ip-row__hint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TokenOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
}

/**
 * A token picker: segmented for a handful of short options, a select otherwise. `"__default"`
 * stands for "not set" (inherit the site's default).
 */
export function TokenPicker<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  defaultLabel,
  segmented,
}: {
  label: string;
  value: V | undefined;
  options: ReadonlyArray<TokenOption<V>>;
  onChange: (value: V | undefined) => void;
  disabled?: boolean;
  /** Offer "default" (unset) with this label. */
  defaultLabel?: string;
  segmented?: boolean;
}) {
  const DEFAULT = "__default";
  const all = defaultLabel
    ? [{ value: DEFAULT as V, label: defaultLabel } as TokenOption<V>, ...options]
    : options;
  const current = (value ?? (defaultLabel ? DEFAULT : undefined)) as V | undefined;
  const emit = (v: V) => onChange(v === DEFAULT ? undefined : v);
  if (segmented) {
    return (
      <Segmented<V>
        disabled={disabled}
        aria-label={label}
        size="sm"
        block
        value={current as V}
        onValueChange={(v) => !disabled && emit(v)}
        options={all.map((o) => ({
          value: o.value,
          label: o.label,
          ...(o.hint ? { ariaLabel: `${o.label} (${o.hint})` } : {}),
          disabled,
        }))}
      />
    );
  }
  return (
    <Select<V>
      aria-label={label}
      size="sm"
      value={current}
      disabled={disabled}
      onValueChange={emit}
      options={all.map((o) => ({
        value: o.value,
        textValue: o.label,
        label: o.hint ? (
          <span className="st-ip-opt">
            <span>{o.label}</span>
            <span className="st-ip-opt__hint">{o.hint}</span>
          </span>
        ) : (
          o.label
        ),
      }))}
    />
  );
}

/** One-line note shown when the role can't change something. */
export function RoleNote({ children }: { children: ReactNode }) {
  return <p className="st-ip-note">{children}</p>;
}
