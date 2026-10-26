import { FileAudio, ImagePlus, Link2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button, Field, IconButton, Input, Select } from "../../ui";
import { useMediaPreviewUrl } from "../media/sources";
import { useManageUi } from "../site-mgmt/manage-ui";
import { moneyInput, parseMoney } from "../workspace/format";

export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "JPY",
  "MXN",
  "BRL",
  "INR",
  "ZAR",
  "SGD",
];

/**
 * A media file or web address: a thumbnail, "Choose" from the library (upload lives there too),
 * or paste an https link.
 */
export function MediaField({
  label,
  value,
  onChange,
  accept = "image",
  hint,
  error,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (src: string | null) => void;
  accept?: "image" | "any";
  hint?: string;
  error?: string;
}) {
  const url = useMediaPreviewUrl(value);
  const [linking, setLinking] = useState(false);
  const [draft, setDraft] = useState("");
  const isImage = accept === "image";
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="st-mediafield">
        {value ? (
          isImage && url ? (
            <img className="st-mediafield__thumb" src={url} alt="" />
          ) : (
            <span className="st-mediafield__file" title={value}>
              <FileAudio aria-hidden="true" />
              <span>{value.split("/").pop()}</span>
            </span>
          )
        ) : null}
        {linking ? (
          <form
            className="st-mediafield__link"
            onSubmit={(e) => {
              e.preventDefault();
              const v = draft.trim();
              if (v) onChange(v);
              setLinking(false);
            }}
          >
            <Input
              size="sm"
              aria-label={`${label} web address`}
              placeholder="https://…"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button size="sm" type="submit">
              Use
            </Button>
          </form>
        ) : (
          <div className="st-mediafield__actions">
            <Button
              size="sm"
              icon={<ImagePlus />}
              onClick={() =>
                useManageUi.getState().pickMedia({
                  title: label,
                  accept,
                  onPick: (p) => onChange(p),
                })
              }
            >
              {value ? "Change" : "Choose"}
            </Button>
            <IconButton
              size="sm"
              label={`Use a web address for ${label.toLowerCase()}`}
              icon={<Link2 />}
              onClick={() => {
                setDraft(value && /^https:/.test(value) ? value : "");
                setLinking(true);
              }}
            />
            {value && (
              <IconButton
                size="sm"
                label={`Remove ${label.toLowerCase()}`}
                icon={<X />}
                onClick={() => onChange(null)}
              />
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

/** Price in major units with a currency picker; stores minor units. */
export function MoneyField({
  label,
  amount,
  currency,
  onChange,
  currencyLocked,
  optional,
  hint,
  error,
}: {
  label: string;
  amount: number | null | undefined;
  currency: string;
  onChange: (next: { amount: number; currency: string } | null) => void;
  /** Variants share the product's currency. */
  currencyLocked?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
}) {
  const [text, setText] = useState(moneyInput(amount, currency));
  const [bad, setBad] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: follows outside changes only, never the text being typed
  useEffect(() => {
    const parsed = parseMoney(text, currency);
    if (parsed !== (amount ?? null)) setText(moneyInput(amount, currency));
    // Only follow outside changes.
  }, [amount, currency]);
  const id = useId();
  return (
    <Field
      label={label}
      hint={hint}
      error={error ?? (bad ? "Enter a price like 24 or 24.50" : undefined)}
    >
      <div className="st-moneyfield" id={id}>
        <Input
          inputMode="decimal"
          aria-label={label}
          value={text}
          placeholder={optional ? "Same as product" : "0.00"}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            if (!v.trim() && optional) {
              setBad(false);
              onChange(null);
              return;
            }
            const minor = parseMoney(v, currency);
            setBad(minor === null || minor < 0);
            if (minor !== null && minor >= 0) onChange({ amount: minor, currency });
          }}
        />
        {!currencyLocked && (
          <Select
            size="sm"
            value={currency}
            onValueChange={(c) => onChange({ amount: amount ?? 0, currency: c })}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        )}
        {currencyLocked && <span className="st-moneyfield__cur">{currency}</span>}
      </div>
    </Field>
  );
}

/** Whole number input that reports undefined when empty. */
export function IntField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
  hint,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (n: number | undefined) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (!v.trim()) return onChange(undefined);
          const n = Math.round(Number(v));
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </Field>
  );
}
