import { Search, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { HubError } from "../../api/types";
import { Button, cx, Dialog, IconButton, Input, Toggle } from "../../ui";

/** Plain-language message for anything thrown by the Hub client. */
export function errorMessage(err: unknown): string {
  if (err instanceof HubError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Title row of a workspace screen. */
export function WsHeader({
  title,
  description,
  actions,
  leading,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="st-ws-head">
      {leading}
      <div className="st-ws-head__text">
        <h2 className="st-ws-head__title">{title}</h2>
        {description && <p className="st-ws-head__desc">{description}</p>}
      </div>
      {actions && <div className="st-ws-head__actions">{actions}</div>}
    </header>
  );
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="search"
      aria-label={label}
      placeholder={placeholder ?? label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      prefix={<Search aria-hidden="true" />}
      className="st-ws-search"
    />
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  busy,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** Small tag editor: type and press Enter or comma; Backspace removes the last tag. */
export function TagInput({
  value,
  onChange,
  label,
  placeholder = "Add a tag",
  suggestions = [],
  id,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
  placeholder?: string;
  suggestions?: string[];
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const open = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="st-tags">
      {value.map((t) => (
        <span key={t} className="st-tag">
          {t}
          <button
            type="button"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(value.filter((x) => x !== t))}
          >
            <X aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={id}
        aria-label={label}
        className="st-tags__input"
        value={draft}
        placeholder={value.length ? "" : placeholder}
        list={open.length ? listId : undefined}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            add(v);
            setDraft("");
          } else setDraft(v);
        }}
        onKeyDown={onKey}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
      />
      {open.length > 0 && (
        <datalist id={listId}>
          {open.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** A labelled stat (number, then words). */
export function Stat({
  label,
  value,
  detail,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="st-stat">
      <span className="st-stat__label">{label}</span>
      <span className="st-stat__value">{value}</span>
      {detail && <span className="st-stat__detail">{detail}</span>}
    </div>
  );
}

/** A selectable list row that also works as a button (keyboard + screen readers). */
export function RowButton({
  selected,
  onClick,
  children,
  className,
  label,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={cx("st-ws-row", selected && "is-selected", className)}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Close button + Esc for full-screen workspace sub-views. */
export function useEscape(onEscape: () => void) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role='dialog']")) ref.current();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

export function CloseButton({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return <IconButton label={label} icon={<X />} size="sm" onClick={onClick} />;
}

/** Copy a value to the clipboard, returning whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A labelled on/off switch with optional help text (the label is tied to the switch). */
export function SwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("st-switch-row", className)}>
      <div>
        <label htmlFor={id} className="st-switch-row__label">
          {label}
        </label>
        {hint && <span className="st-switch-row__hint">{hint}</span>}
      </div>
      <Toggle id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
