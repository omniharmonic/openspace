import { Check } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { type Hsv, hexToHsv, hsvToHex, luminance, normalizeHex } from "./color";
import "./ColorPicker.css";
import { cx } from "./cx";
import { Input } from "./Input";
import { Popover } from "./Popover";
import { Segmented } from "./Segmented";

/** A named color from the site's palette (design token). */
export interface ColorToken {
  id: string;
  name: string;
  value: string;
}

/** Token-first color value: a palette reference, or an exact hex escape hatch. */
export type ColorValue = { kind: "token"; token: string } | { kind: "exact"; hex: string };

export function resolveColor(
  value: ColorValue | null,
  tokens: ReadonlyArray<ColorToken>,
): string | null {
  if (!value) return null;
  if (value.kind === "exact") return value.hex;
  return tokens.find((t) => t.id === value.token)?.value ?? null;
}

export interface ColorSwatchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  color: string | null;
  size?: number;
  selected?: boolean;
  label: string;
}

/** A single color chip; renders a checkerboard for "none". */
export const ColorSwatch = forwardRef<HTMLButtonElement, ColorSwatchProps>(function ColorSwatch(
  { color, size = 20, selected, label, className, type = "button", ...rest },
  ref,
) {
  const dark = color ? luminance(color) < 0.4 : false;
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cx("st-swatch", !color && "st-swatch--none", className)}
      style={{ width: size, height: size, background: color ?? undefined }}
      {...rest}
    >
      {selected && <Check className="st-swatch__check" style={{ color: dark ? "#fff" : "#111" }} />}
    </button>
  );
});

function SaturationArea({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const update = (e: PointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ ...hsv, s, v });
  };
  return (
    <div
      ref={ref}
      className="st-cp__sv"
      style={{ background: `hsl(${hsv.h} 100% 50%)` }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && update(e)}
      aria-hidden="true"
    >
      <span
        className="st-cp__sv-thumb"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  );
}

export interface ColorPickerPanelProps {
  value: ColorValue | null;
  onChange: (value: ColorValue) => void;
  tokens: ReadonlyArray<ColorToken>;
}

/** Picker body: palette tokens first, "Exact" color as escape hatch. */
export function ColorPickerPanel({ value, onChange, tokens }: ColorPickerPanelProps) {
  const [mode, setMode] = useState<"palette" | "exact">(
    value?.kind === "exact" ? "exact" : "palette",
  );
  const resolved = resolveColor(value, tokens) ?? "#000000";
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(resolved));
  const [hexDraft, setHexDraft] = useState(resolved.replace("#", "").toUpperCase());

  // Resync when the value changes from outside (keeps hue stable while dragging).
  useEffect(() => {
    setHsv((cur) => (hsvToHex(cur) === resolved ? cur : hexToHsv(resolved)));
    setHexDraft(resolved.replace("#", "").toUpperCase());
  }, [resolved]);

  const setExact = (next: Hsv) => {
    setHsv(next);
    onChange({ kind: "exact", hex: hsvToHex(next) });
  };

  return (
    <div className="st-cp">
      <Segmented
        aria-label="Color source"
        block
        size="sm"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: "palette", label: "Site colors" },
          { value: "exact", label: "Exact" },
        ]}
      />
      {mode === "palette" ? (
        <fieldset className="st-cp__tokens">
          <legend className="st-visually-hidden">Site colors</legend>
          {tokens.map((t) => (
            <div key={t.id} className="st-cp__token">
              <ColorSwatch
                color={t.value}
                label={t.name}
                size={24}
                selected={value?.kind === "token" && value.token === t.id}
                onClick={() => onChange({ kind: "token", token: t.id })}
              />
              <span className="st-cp__token-name">{t.name}</span>
            </div>
          ))}
        </fieldset>
      ) : (
        <div className="st-cp__exact">
          <SaturationArea hsv={hsv} onChange={setExact} />
          <input
            type="range"
            className="st-cp__hue"
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            aria-label="Hue"
            onChange={(e) => setExact({ ...hsv, h: Number(e.target.value) })}
          />
          <Input
            size="sm"
            aria-label="Hex color"
            prefix={<span className="st-cp__chip" style={{ background: resolved }} />}
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={() => {
              const hex = normalizeHex(hexDraft);
              if (hex) onChange({ kind: "exact", hex });
              else setHexDraft(resolved.replace("#", "").toUpperCase());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
      )}
    </div>
  );
}

export interface ColorPickerProps extends ColorPickerPanelProps {
  label: string;
}

/** Swatch trigger + popover picker. */
export function ColorPicker({ label, value, onChange, tokens }: ColorPickerProps) {
  const color = resolveColor(value, tokens);
  const tokenName =
    value?.kind === "token" ? tokens.find((t) => t.id === value.token)?.name : undefined;
  return (
    <Popover
      title={label}
      width={232}
      trigger={
        <button
          type="button"
          className="st-cp-trigger"
          aria-label={`${label}: ${tokenName ?? color ?? "none"}`}
        >
          <span className="st-cp__chip" style={{ background: color ?? "transparent" }} />
          <span className="st-cp-trigger__text">{tokenName ?? color?.toUpperCase() ?? "None"}</span>
        </button>
      }
    >
      <ColorPickerPanel value={value} onChange={onChange} tokens={tokens} />
    </Popover>
  );
}
