import { blocksRegistry } from "@openspace/blocks";
import { compiledStylesFor } from "@openspace/renderer";
import {
  ANIMATIONS,
  type Animation,
  type Block,
  type BlockStyle,
  humanize,
  IMAGE_TREATMENTS,
  RADIUS_TOKENS,
  type Responsive,
  SHADOW_TOKENS,
  SPACE_TOKENS,
  TYPE_PRESETS,
} from "@openspace/schema";
import { SPACE_SCALES } from "@openspace/theme";
import { useMemo } from "react";
import { Toggle } from "../../../ui";
import { useDocStore, useDocStoreApi } from "../../editor/model/context";
import { useEditBp } from "../env";
import { blockStyleOp, withStyle } from "../model/edits";
import type { Capabilities } from "../model/permissions";
import { PanelSection, PropRow, RoleNote } from "../ui";
import { AlignControl, ResponsiveField, ThemeSwatches, TokenSelect } from "./controls";

const TYPE_LABEL: Record<string, string> = {
  display: "Display",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  lead: "Lead",
  body: "Body",
  small: "Small",
  eyebrow: "Eyebrow",
};

export function spaceOptions(density: keyof typeof SPACE_SCALES) {
  const scale = SPACE_SCALES[density];
  return SPACE_TOKENS.map((t) => ({
    value: t,
    label: t === "none" ? "None" : t.toUpperCase(),
    hint: t === "none" ? "0" : `${scale[t] ?? 0}px`,
  }));
}

export const ANIMATION_LABEL: Record<(typeof ANIMATIONS)[number], string> = {
  none: "None",
  fade: "Fade in",
  rise: "Rise",
  slide: "Slide in",
  zoom: "Zoom",
  clip: "Reveal",
};

export function AnimationRows({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: Animation | undefined;
  onChange: (v: Animation | undefined) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <>
      <PropRow label="Entrance">
        <TokenSelect
          label="Entrance animation"
          value={value?.entrance}
          defaultLabel="Site default"
          disabled={disabled}
          options={ANIMATIONS.map((a) => ({ value: a, label: ANIMATION_LABEL[a] }))}
          onChange={(e) => onChange(e ? { ...(value ?? {}), entrance: e } : undefined)}
        />
      </PropRow>
      {value && value.entrance !== "none" && (
        <PropRow
          label="Stagger"
          htmlFor={`${idPrefix}-stagger`}
          hint="Children appear one after another."
        >
          <div className="st-ip-fixed">
            <Toggle
              id={`${idPrefix}-stagger`}
              size="sm"
              checked={value.stagger === true}
              disabled={disabled}
              onCheckedChange={(c) => {
                const next = { ...value };
                if (c) next.stagger = true;
                else delete next.stagger;
                onChange(next);
              }}
            />
          </div>
        </PropRow>
      )}
    </>
  );
}

/** Design controls for a block: variant, then exactly the style slots its definition declares. */
export function BlockDesign({
  block,
  container,
  caps,
}: {
  block: Block;
  container: string;
  caps: Capabilities;
}) {
  const api = useDocStoreApi();
  const styles = useDocStore((s) => s.doc.styles);
  const bp = useEditBp();
  const def = blocksRegistry().get(block.type);
  const themes = useMemo(() => compiledStylesFor(styles).tokens.themes, [styles]);
  if (!def) return null;
  const slots = new Set<string>(def.styleSlots);
  const style = block.style ?? {};
  const disabled = !caps.blockDesign;
  const commitStyle = (next: BlockStyle, label: string) =>
    api.getState().commit([blockStyleOp(container, block, next)], { label });
  const set = <K extends keyof BlockStyle>(key: K, v: BlockStyle[K] | undefined, label: string) =>
    commitStyle(withStyle(block, key, v), label);
  const typoSlots = def.styleSlots
    .filter((s) => s.startsWith("typography."))
    .map((s) => s.slice(11));
  const hasLook = def.variants.length > 1 || slots.has("colorTheme") || typoSlots.length > 0;
  const hasBox = ["padding", "align", "radius", "border", "shadow", "imageTreatment"].some((k) =>
    slots.has(k),
  );
  const idp = `st-ip-${block.id}`;

  return (
    <>
      {disabled && caps.note && <RoleNote>{caps.note}</RoleNote>}
      {hasLook && (
        <PanelSection title="Look">
          {def.variants.length > 1 && (
            <PropRow label="Style">
              <TokenSelect
                label="Block style"
                value={block.variant ?? def.defaults.variant}
                disabled={disabled}
                segmented={def.variants.length <= 3 && def.variants.every((v) => v.length <= 9)}
                options={def.variants.map((v) => ({ value: v, label: humanize(v) }))}
                onChange={(v) =>
                  api.getState().commit(
                    [
                      {
                        op: "block.update",
                        page: container,
                        block: block.id,
                        variant: v ?? null,
                      } as never,
                    ],
                    { label: "Change block style" },
                  )
                }
              />
            </PropRow>
          )}
          {slots.has("colorTheme") && (
            <PropRow
              label="Color theme"
              stacked
              hint={style.colorTheme ? undefined : "Follows the section’s theme."}
            >
              <ThemeSwatches
                label="Block color theme"
                value={style.colorTheme}
                colors={themes}
                disabled={disabled}
                inheritLabel="Section"
                onChange={(t) =>
                  set("colorTheme", t as BlockStyle["colorTheme"], "Change color theme")
                }
              />
            </PropRow>
          )}
          {typoSlots.map((slot) => (
            <PropRow key={slot} label={`${humanize(slot)} text`}>
              <TokenSelect
                label={`${humanize(slot)} typography`}
                value={style.typography?.[slot]}
                defaultLabel="Default"
                disabled={disabled}
                options={TYPE_PRESETS.map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))}
                onChange={(t) => {
                  const typography = { ...(style.typography ?? {}) };
                  if (t) typography[slot] = t;
                  else delete typography[slot];
                  set(
                    "typography",
                    Object.keys(typography).length ? typography : undefined,
                    "Change typography",
                  );
                }}
              />
            </PropRow>
          ))}
        </PanelSection>
      )}
      {hasBox && (
        <PanelSection title="Layout & shape">
          {slots.has("padding") && (
            <ResponsiveField<(typeof SPACE_TOKENS)[number]>
              label="Padding"
              value={style.padding}
              bp={bp}
              base="none"
              disabled={disabled}
              onCommit={(v) =>
                set(
                  "padding",
                  v as Responsive<(typeof SPACE_TOKENS)[number]> | undefined,
                  "Change padding",
                )
              }
              render={(cur, setV) => (
                <TokenSelect
                  label="Padding"
                  value={cur}
                  defaultLabel={bp === "d" ? "None" : "Same as desktop"}
                  disabled={disabled}
                  options={spaceOptions(styles.choices.density)}
                  onChange={setV}
                />
              )}
            />
          )}
          {slots.has("align") && (
            <ResponsiveField<"start" | "center" | "end">
              label="Align"
              value={style.align}
              bp={bp}
              base="start"
              disabled={disabled}
              onCommit={(v) => set("align", v, "Change alignment")}
              render={(cur, setV) => (
                <AlignControl label="Alignment" value={cur} disabled={disabled} onChange={setV} />
              )}
            />
          )}
          {slots.has("radius") && (
            <PropRow label="Corners">
              <TokenSelect
                label="Corner radius"
                value={style.radius}
                defaultLabel="Site shape"
                disabled={disabled}
                options={RADIUS_TOKENS.map((r) => ({
                  value: r,
                  label: r === "full" ? "Round" : humanize(r),
                }))}
                onChange={(r) => set("radius", r, "Change corners")}
              />
            </PropRow>
          )}
          {slots.has("border") && (
            <PropRow label="Border">
              <TokenSelect
                label="Border"
                value={style.border}
                segmented
                disabled={disabled}
                options={[
                  { value: "none", label: "None" },
                  { value: "subtle", label: "Subtle" },
                  { value: "strong", label: "Strong" },
                ]}
                onChange={(b) => set("border", b === "none" ? undefined : b, "Change border")}
              />
            </PropRow>
          )}
          {slots.has("shadow") && (
            <PropRow label="Shadow">
              <TokenSelect
                label="Shadow"
                value={style.shadow ?? "none"}
                segmented
                disabled={disabled}
                options={SHADOW_TOKENS.map((s) => ({ value: s, label: humanize(s) }))}
                onChange={(s) => set("shadow", s === "none" ? undefined : s, "Change shadow")}
              />
            </PropRow>
          )}
          {slots.has("imageTreatment") && (
            <PropRow label="Image">
              <TokenSelect
                label="Image treatment"
                value={style.imageTreatment}
                defaultLabel="Site default"
                disabled={disabled}
                options={IMAGE_TREATMENTS.map((t) => ({ value: t, label: humanize(t) }))}
                onChange={(t) => set("imageTreatment", t, "Change image treatment")}
              />
            </PropRow>
          )}
        </PanelSection>
      )}
      {slots.has("animation") && (
        <PanelSection title="Animation" defaultOpen={false}>
          <AnimationRows
            idPrefix={idp}
            value={style.animation}
            disabled={disabled}
            onChange={(a) => set("animation", a, "Change animation")}
          />
        </PanelSection>
      )}
      {!hasLook && !hasBox && !slots.has("animation") && (
        <p className="st-ip-note">This block takes its look from the section and Site Styles.</p>
      )}
    </>
  );
}
