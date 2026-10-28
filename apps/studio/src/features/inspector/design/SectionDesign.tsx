import type { OpBody } from "@omniharmonic/openspace-ops";
import { compiledStylesFor } from "@omniharmonic/openspace-renderer";
import {
  type Animation,
  CONTENT_WIDTHS,
  phoneColumns,
  phonePadding,
  type Responsive,
  type Section,
  type SectionBackground,
  type SectionStyle,
  type SPACE_TOKENS,
  type StackLayout,
} from "@omniharmonic/openspace-schema";
import { ArrowLeft, ArrowRight, LayoutGrid, Rows3, Smartphone } from "lucide-react";
import { useMemo } from "react";
import {
  Button,
  ColorPicker,
  Input,
  NumberScrubInput,
  Segmented,
  Slider,
  Toggle,
} from "../../../ui";
import { setLayoutMode } from "../../editor/model/actions";
import { useDocStore, useDocStoreApi } from "../../editor/model/context";
import { useEditBp } from "../env";
import { FocalPointPicker } from "../fields/media";
import { useOpenMediaPicker } from "../media";
import { fromPickerValue, paletteTokens, previewColor, toPickerValue } from "../model/colors";
import { RATIO_PRESETS, sectionOp, stackColumnsOps, withStackOrder } from "../model/edits";
import type { Capabilities } from "../model/permissions";
import { BP_LABEL, type Bp, overriddenBps } from "../model/responsive";
import { PanelSection, PropRow, RoleNote } from "../ui";
import { AnimationRows, spaceOptions } from "./BlockDesign";
import { ResponsiveField, ThemeSwatches, TokenSelect } from "./controls";

/** Desktop section padding used when the first padding value is a tablet/phone override. */
export const SECTION_PAD_BASE = "3xl";

const MIN_HEIGHTS = [
  { value: "auto", label: "Fit content" },
  { value: "50vh", label: "Half screen" },
  { value: "70vh", label: "Tall" },
  { value: "90vh", label: "Almost full" },
  { value: "100svh", label: "Full screen" },
] as const;

const WIDTH_LABEL: Record<(typeof CONTENT_WIDTHS)[number], string> = {
  narrow: "Narrow",
  content: "Standard",
  wide: "Wide",
  full: "Full bleed",
};

function RatioPresets({
  count,
  value,
  onPick,
  disabled,
  label,
}: {
  count: number;
  value: number[];
  onPick: (spans: number[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const presets = RATIO_PRESETS[count] ?? [];
  if (presets.length < 2) return null;
  return (
    <fieldset className="st-ip-ratios st-ip-fieldset">
      <legend className="st-visually-hidden">{label}</legend>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          className="st-ip-ratio"
          aria-pressed={p.spans.join() === value.join()}
          aria-label={p.label}
          title={p.label}
          disabled={disabled}
          onClick={() => onPick(p.spans)}
        >
          {p.spans.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional columns
            <span key={i} style={{ flex: s }} />
          ))}
        </button>
      ))}
    </fieldset>
  );
}

function StackLayoutControls({
  section,
  container,
  bp,
  disabled,
}: {
  section: Section & { layout: StackLayout };
  container: string;
  bp: Bp;
  disabled: boolean;
}) {
  const api = useDocStoreApi();
  const layout = section.layout;
  const count = layout.columns.d.length;
  const commit = (bodies: OpBody[], label: string) => api.getState().commit(bodies, { label });
  const setLayout = (next: StackLayout, label: string) =>
    commit([sectionOp(container, section, { layout: next })], label);
  // Phones stack into one column unless the section sets its own phone columns (the renderer's
  // phone default), so that is what the phone view shows.
  const bpCols =
    bp === "d"
      ? layout.columns.d
      : bp === "t"
        ? (layout.columns.t ?? layout.columns.d)
        : phoneColumns(layout.columns);
  const stacked = bp !== "d" && bpCols.length === 1 && count > 1;
  const order =
    bp === "d" ? undefined : bp === "t" ? layout.order?.t : (layout.order?.m ?? layout.order?.t);
  const shownOrder = order ?? Array.from({ length: count }, (_, i) => i);
  return (
    <>
      {bp === "d" ? (
        <>
          <PropRow label="Columns">
            <Segmented<string>
              disabled={disabled}
              aria-label="Number of columns"
              size="sm"
              block
              value={String(count)}
              onValueChange={(v) =>
                !disabled &&
                commit(stackColumnsOps(container, section, Number(v)), "Change columns")
              }
              options={["1", "2", "3", "4"].map((n) => ({ value: n, label: n, disabled }))}
            />
          </PropRow>
          {count > 1 && (
            <PropRow label="Widths" stacked>
              <RatioPresets
                label="Column widths"
                count={count}
                value={layout.columns.d}
                disabled={disabled}
                onPick={(spans) =>
                  setLayout(
                    { ...layout, columns: { ...layout.columns, d: spans } },
                    "Change column widths",
                  )
                }
              />
            </PropRow>
          )}
        </>
      ) : (
        count > 1 && (
          <>
            <PropRow
              label={`On ${BP_LABEL[bp].toLowerCase()}`}
              overrides={overriddenBps(layout.columns)}
            >
              <Segmented<"side" | "stack">
                disabled={disabled}
                aria-label={`Columns on ${BP_LABEL[bp].toLowerCase()}`}
                size="sm"
                block
                value={stacked ? "stack" : "side"}
                onValueChange={(v) => {
                  if (disabled) return;
                  const columns = { ...layout.columns };
                  columns[bp] = v === "stack" ? [12] : [...layout.columns.d];
                  setLayout(
                    { ...layout, columns },
                    v === "stack" ? "Stack columns" : "Columns side by side",
                  );
                }}
                options={[
                  { value: "side", label: "Side by side" },
                  { value: "stack", label: "Stacked" },
                ]}
              />
            </PropRow>
            {!stacked && (
              <PropRow label="Widths" stacked>
                <RatioPresets
                  label={`Column widths on ${BP_LABEL[bp].toLowerCase()}`}
                  count={count}
                  value={bpCols}
                  disabled={disabled}
                  onPick={(spans) =>
                    setLayout(
                      { ...layout, columns: { ...layout.columns, [bp]: spans } },
                      "Change column widths",
                    )
                  }
                />
              </PropRow>
            )}
            {stacked && (
              <PropRow
                label="Order"
                stacked
                overrides={(["t", "m"] as const).filter((b) => layout.order?.[b])}
                hint="Which column comes first when they stack."
              >
                <ol
                  className="st-ip-order"
                  aria-label={`Stacking order on ${BP_LABEL[bp].toLowerCase()}`}
                >
                  {shownOrder.map((c, i) => (
                    <li key={c} className="st-ip-order__col">
                      Column {c + 1}
                      <button
                        type="button"
                        className="st-ip-icon-btn"
                        aria-label={`Move column ${c + 1} earlier`}
                        disabled={disabled || i === 0}
                        onClick={() => {
                          const o = [...shownOrder];
                          [o[i - 1], o[i]] = [o[i] as number, o[i - 1] as number];
                          setLayout(
                            withStackOrder(layout, bp as "t" | "m", o),
                            "Change stacking order",
                          );
                        }}
                      >
                        <ArrowLeft aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="st-ip-icon-btn"
                        aria-label={`Move column ${c + 1} later`}
                        disabled={disabled || i === shownOrder.length - 1}
                        onClick={() => {
                          const o = [...shownOrder];
                          [o[i + 1], o[i]] = [o[i] as number, o[i + 1] as number];
                          setLayout(
                            withStackOrder(layout, bp as "t" | "m", o),
                            "Change stacking order",
                          );
                        }}
                      >
                        <ArrowRight aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
              </PropRow>
            )}
          </>
        )
      )}
      <PropRow label="Align">
        <TokenSelect
          label="Vertical alignment"
          value={layout.align ?? "start"}
          disabled={disabled}
          options={[
            { value: "start", label: "Top" },
            { value: "center", label: "Middle" },
            { value: "end", label: "Bottom" },
            { value: "stretch", label: "Fill" },
          ]}
          onChange={(a) => {
            const next = { ...layout };
            if (a && a !== "start") next.align = a;
            else delete next.align;
            setLayout(next, "Change alignment");
          }}
        />
      </PropRow>
      <PropRow label="Gap">
        <TokenSelect
          label="Gap between columns"
          value={layout.gap}
          defaultLabel="Site density"
          disabled={disabled}
          options={spaceOptions(api.getState().doc.styles.choices.density).filter(
            (o) => o.value !== "none",
          )}
          onChange={(g) => {
            const next = { ...layout };
            if (g) next.gap = g;
            else delete next.gap;
            setLayout(next, "Change gap");
          }}
        />
      </PropRow>
    </>
  );
}

function BackgroundControls({
  section,
  container,
  caps,
}: {
  section: Section;
  container: string;
  caps: Capabilities;
}) {
  const api = useDocStoreApi();
  const styles = useDocStore((s) => s.doc.styles);
  const open = useOpenMediaPicker();
  const tokens = useMemo(
    () => paletteTokens(styles, section.style.colorTheme ?? "light"),
    [styles, section.style.colorTheme],
  );
  const bg: SectionBackground = section.style.background ?? { type: "none" };
  const disabled = !caps.sectionDesign;
  const commit = (
    next: SectionBackground | undefined,
    label = "Change background",
    merge = false,
  ) =>
    api.getState().commit(
      [
        sectionOp(container, section, {
          "style.background": next?.type === "none" ? undefined : next,
        }),
      ],
      {
        label,
        ...(merge ? { mergeKey: `bg:${section.id}` } : {}),
      },
    );
  const pickImage = async (type: "image" | "video") => {
    const pick = await open({
      accept: type,
      title: type === "image" ? "Choose a background photo" : "Choose a background video",
    });
    if (!pick) return;
    commit(
      type === "image"
        ? { type: "image", src: pick.src, ...(pick.focal ? { focal: pick.focal } : {}) }
        : { type: "video", src: pick.src, ...(pick.poster ? { poster: pick.poster } : {}) },
      type === "image" ? "Set background photo" : "Set background video",
    );
  };
  const colorPicker = (label: string, value: string, onChange: (v: string) => void) => (
    <ColorPicker
      label={label}
      tokens={tokens}
      value={toPickerValue(value)}
      allowExact={caps.exact}
      disabled={disabled}
      onChange={(v) => onChange(fromPickerValue(v))}
    />
  );
  const overlay = bg.type === "image" || bg.type === "video" ? bg.overlay : undefined;
  return (
    <>
      <PropRow label="Fill">
        <TokenSelect
          label="Background"
          value={bg.type}
          disabled={disabled}
          options={[
            { value: "none", label: "Theme color" },
            { value: "color", label: "Color" },
            { value: "gradient", label: "Gradient" },
            { value: "image", label: "Photo" },
            { value: "video", label: "Video" },
          ]}
          onChange={(t) => {
            if (!t || t === "none") commit(undefined, "Remove background");
            else if (t === "color") commit({ type: "color", color: "accent" });
            else if (t === "gradient")
              commit({ type: "gradient", from: "accent", to: "accent-700", angle: 135 });
            else void pickImage(t as "image" | "video");
          }}
        />
      </PropRow>
      {bg.type === "color" && (
        <PropRow label="Color">
          {colorPicker("Background color", bg.color, (c) =>
            commit({ ...bg, color: c }, "Change background color", true),
          )}
        </PropRow>
      )}
      {bg.type === "gradient" && (
        <>
          <div
            className="st-ip-grad"
            style={{
              background: `linear-gradient(${bg.angle ?? 180}deg, ${[bg.from, bg.via, bg.to]
                .filter(Boolean)
                .map((c) => previewColor(c, tokens) ?? "transparent")
                .join(", ")})`,
            }}
          />
          <PropRow label="From">
            {colorPicker("Gradient start", bg.from, (c) =>
              commit({ ...bg, from: c }, "Change gradient", true),
            )}
          </PropRow>
          <PropRow label="Through">
            {bg.via ? (
              <div className="st-ip-swatchrow">
                {colorPicker("Gradient middle", bg.via, (c) =>
                  commit({ ...bg, via: c }, "Change gradient", true),
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    const { via: _v, ...rest } = bg;
                    commit(rest, "Change gradient");
                  }}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => commit({ ...bg, via: "surface" }, "Change gradient")}
              >
                Add middle color
              </Button>
            )}
          </PropRow>
          <PropRow label="To">
            {colorPicker("Gradient end", bg.to, (c) =>
              commit({ ...bg, to: c }, "Change gradient", true),
            )}
          </PropRow>
          <PropRow label="Angle">
            <NumberScrubInput
              label="Angle"
              value={bg.angle ?? 180}
              min={0}
              max={360}
              unit="°"
              disabled={disabled}
              onChange={(a) => commit({ ...bg, angle: Math.round(a) }, "Change gradient", true)}
            />
          </PropRow>
        </>
      )}
      {(bg.type === "image" || bg.type === "video") && (
        <>
          <div className="st-ip-btnrow">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => void pickImage(bg.type as "image" | "video")}
            >
              Replace {bg.type === "image" ? "photo" : "video"}
            </Button>
            {bg.type === "video" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={async () => {
                  const pick = await open({ accept: "image", title: "Choose a cover image" });
                  if (pick) commit({ ...bg, poster: pick.src }, "Change video cover");
                }}
              >
                {bg.poster ? "Replace cover" : "Add cover"}
              </Button>
            )}
          </div>
          <PropRow
            label="Focal point"
            stacked
            hint="What stays in view when the photo is cropped on phones."
          >
            <FocalPointPicker
              disabled={disabled}
              src={bg.type === "image" ? bg.src : bg.poster}
              value={bg.focal}
              label="Background focal point"
              onChange={(focal, final) =>
                !disabled && commit({ ...bg, focal }, "Move focal point", !final)
              }
            />
          </PropRow>
          <PropRow label="Overlay" htmlFor={`st-ip-ov-${section.id}`}>
            <div className="st-ip-fixed">
              <Toggle
                id={`st-ip-ov-${section.id}`}
                size="sm"
                checked={Boolean(overlay)}
                disabled={disabled}
                onCheckedChange={(c) => {
                  const next = { ...bg } as typeof bg;
                  if (c) next.overlay = { color: "#000000", opacity: 0.35 };
                  else delete next.overlay;
                  commit(next, "Change overlay");
                }}
              />
            </div>
          </PropRow>
          {overlay && (
            <>
              <PropRow label="Overlay color">
                {colorPicker("Overlay color", overlay.color, (c) =>
                  commit({ ...bg, overlay: { ...overlay, color: c } }, "Change overlay", true),
                )}
              </PropRow>
              <PropRow label="Strength">
                <Slider
                  aria-label="Overlay strength"
                  value={Math.round(overlay.opacity * 100)}
                  min={0}
                  max={90}
                  step={5}
                  disabled={disabled}
                  onValueChange={(v) =>
                    commit(
                      { ...bg, overlay: { ...overlay, opacity: v / 100 } },
                      "Change overlay",
                      true,
                    )
                  }
                />
              </PropRow>
            </>
          )}
          {bg.type === "image" && (
            <PropRow
              label="Parallax"
              htmlFor={`st-ip-px-${section.id}`}
              hint={styles.choices.motion === "none" ? "Motion is off in Site Styles." : undefined}
            >
              <div className="st-ip-fixed">
                <Toggle
                  id={`st-ip-px-${section.id}`}
                  size="sm"
                  checked={bg.parallax === true}
                  disabled={disabled}
                  onCheckedChange={(c) => {
                    const next = { ...bg };
                    if (c) next.parallax = true;
                    else delete next.parallax;
                    commit(next, "Change parallax");
                  }}
                />
              </div>
            </PropRow>
          )}
        </>
      )}
    </>
  );
}

/** Design controls for a section: layout, color theme, spacing, background, animation. */
export function SectionDesign({
  section,
  container,
  caps,
  measure,
}: {
  section: Section;
  container: string;
  caps: Capabilities;
  /** Measured block heights (canvas px) for stack → grid. */
  measure?: (blockId: string) => number | undefined;
}) {
  const api = useDocStoreApi();
  const styles = useDocStore((s) => s.doc.styles);
  const bp = useEditBp();
  const themes = useMemo(() => compiledStylesFor(styles).tokens.themes, [styles]);
  const disabled = !caps.sectionDesign;
  const style = section.style;
  const setStyle = <K extends keyof SectionStyle>(
    key: K,
    v: SectionStyle[K] | undefined,
    label: string,
    merge = false,
  ) =>
    api.getState().commit([sectionOp(container, section, { [`style.${key}`]: v })], {
      label,
      ...(merge ? { mergeKey: `sec-style:${section.id}:${key}` } : {}),
    });
  const layout = section.layout;
  const setWidth = (w: string | undefined) => {
    const next = { ...layout } as typeof layout;
    if (w && w !== "content") next.width = w as (typeof CONTENT_WIDTHS)[number];
    else delete next.width;
    api
      .getState()
      .commit([sectionOp(container, section, { layout: next })], { label: "Change width" });
  };
  const switchMode = (mode: "stack" | "grid") => {
    const s = api.getState();
    s.run(setLayoutMode(s.doc, s.pageId, section.id, mode, measure));
  };
  const minH = style.minHeight;
  return (
    <>
      {disabled && caps.note && <RoleNote>{caps.note}</RoleNote>}
      <PanelSection
        title="Layout"
        actions={
          <Segmented<"stack" | "grid">
            disabled={disabled}
            aria-label="Layout mode"
            size="sm"
            value={layout.mode}
            onValueChange={(m) => !disabled && switchMode(m)}
            options={[
              {
                value: "stack",
                label: <Rows3 />,
                ariaLabel: "Stack: blocks flow in columns",
                disabled,
              },
              {
                value: "grid",
                label: <LayoutGrid />,
                ariaLabel: "Grid: place blocks freely",
                disabled,
              },
            ]}
          />
        }
      >
        {layout.mode === "stack" ? (
          <StackLayoutControls
            section={section as Section & { layout: StackLayout }}
            container={container}
            bp={bp}
            disabled={disabled}
          />
        ) : (
          <>
            <p className="st-ip-row__hint">
              Drag and resize blocks on the canvas. The phone layout is arranged separately.
            </p>
            <Button
              size="sm"
              variant="secondary"
              icon={<Smartphone />}
              disabled={disabled}
              onClick={async () => {
                const { autoMobileLayoutOps } = await import("@omniharmonic/openspace-lint");
                const s = api.getState();
                const ops = autoMobileLayoutOps(s.doc, container, section.id, { reset: true });
                if (ops.length)
                  s.commit(ops as unknown as OpBody[], { label: "Rearrange for phones" });
              }}
            >
              Rearrange for phones
            </Button>
          </>
        )}
        <PropRow label="Width">
          <TokenSelect
            label="Content width"
            value={layout.width ?? "content"}
            disabled={disabled}
            options={CONTENT_WIDTHS.map((w) => ({ value: w, label: WIDTH_LABEL[w] }))}
            onChange={setWidth}
          />
        </PropRow>
      </PanelSection>
      <PanelSection title="Color theme">
        <ThemeSwatches
          label="Section color theme"
          value={style.colorTheme ?? "light"}
          colors={themes}
          disabled={disabled}
          onChange={(t) =>
            setStyle(
              "colorTheme",
              (t ?? "light") as SectionStyle["colorTheme"],
              "Change color theme",
            )
          }
        />
      </PanelSection>
      <PanelSection title="Spacing">
        <ResponsiveField<(typeof SPACE_TOKENS)[number]>
          label="Padding"
          value={style.padding}
          bp={bp}
          base={SECTION_PAD_BASE}
          baseHint="Setting this also fixes desktop at 3XL, close to the site’s spacing."
          phoneDefault={(v) => phonePadding(v)}
          disabled={disabled}
          onCommit={(v) =>
            setStyle(
              "padding",
              v as Responsive<(typeof SPACE_TOKENS)[number]> | undefined,
              "Change padding",
            )
          }
          render={(cur, set) => (
            <TokenSelect
              label="Section padding"
              value={cur}
              defaultLabel={bp === "d" ? "Site density" : "Same as desktop"}
              disabled={disabled}
              options={spaceOptions(styles.choices.density)}
              onChange={set}
            />
          )}
        />
        <ResponsiveField<string>
          label="Height"
          value={minH}
          bp={bp}
          base="auto"
          disabled={disabled}
          onCommit={(v) => setStyle("minHeight", v, "Change height")}
          render={(cur, set) => {
            const px = cur && /px$/.test(cur) ? Number.parseInt(cur, 10) : null;
            const control =
              px !== null && caps.exact ? (
                <NumberScrubInput
                  label="Minimum height"
                  value={px}
                  min={10}
                  max={9999}
                  unit="px"
                  disabled={disabled}
                  onChange={(n) => set(`${Math.round(n)}px`)}
                />
              ) : (
                <TokenSelect
                  label="Minimum height"
                  value={
                    cur && MIN_HEIGHTS.some((m) => m.value === cur)
                      ? cur
                      : cur
                        ? "__custom"
                        : undefined
                  }
                  defaultLabel={bp === "d" ? "Fit content" : "Same as desktop"}
                  disabled={disabled}
                  options={[
                    ...MIN_HEIGHTS.filter((m) => m.value !== "auto" || bp !== "d"),
                    ...(cur && !MIN_HEIGHTS.some((m) => m.value === cur)
                      ? [{ value: "__custom", label: cur }]
                      : []),
                  ]}
                  onChange={(v) => v !== "__custom" && set(v)}
                />
              );
            if (!caps.exact) return control;
            return (
              <>
                {control}
                <button
                  type="button"
                  className="st-ip-icon-btn st-ip-fixed st-ip-unit"
                  aria-pressed={px !== null}
                  aria-label="Exact height in pixels"
                  title="Exact height in pixels"
                  disabled={disabled}
                  onClick={() => set(px !== null ? undefined : "480px")}
                >
                  px
                </button>
              </>
            );
          }}
        />
      </PanelSection>
      <PanelSection title="Background">
        <BackgroundControls section={section} container={container} caps={caps} />
      </PanelSection>
      <PanelSection title="Animation" defaultOpen={false}>
        <AnimationRows
          idPrefix={`st-ip-${section.id}`}
          value={style.animation as Animation | undefined}
          disabled={disabled}
          onChange={(a) => setStyle("animation", a, "Change animation")}
        />
      </PanelSection>
      <SectionSettings section={section} container={container} caps={caps} />
    </>
  );
}

function SectionSettings({
  section,
  container,
  caps,
}: {
  section: Section;
  container: string;
  caps: Capabilities;
}) {
  const api = useDocStoreApi();
  const commit = (set: Record<string, unknown>, label: string) =>
    api.getState().commit([sectionOp(container, section, set)], { label });
  return (
    <PanelSection title="Section" defaultOpen={false}>
      <PropRow label="Name" htmlFor={`st-ip-name-${section.id}`} hint="Shown in Layers.">
        <Input
          id={`st-ip-name-${section.id}`}
          size="sm"
          key={section.label ?? ""}
          defaultValue={section.label ?? ""}
          disabled={!caps.structure}
          onBlur={(e) => {
            const v = e.target.value.trim().slice(0, 80);
            if (v !== (section.label ?? "")) commit({ label: v || undefined }, "Rename section");
          }}
        />
      </PropRow>
      {container !== "footer" && (
        <PropRow
          label="Link name"
          htmlFor={`st-ip-anchor-${section.id}`}
          hint="Lets links jump here, like /about#team."
        >
          <Input
            id={`st-ip-anchor-${section.id}`}
            size="sm"
            prefix={<span className="st-ip-count">#</span>}
            key={section.anchor ?? ""}
            defaultValue={section.anchor ?? ""}
            disabled={!caps.structure}
            onBlur={(e) => {
              const v = e.target.value
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              if (v !== (section.anchor ?? ""))
                commit({ anchor: v || undefined }, "Change link name");
            }}
          />
        </PropRow>
      )}
      {container !== "footer" && (
        <PropRow
          label="Hidden"
          htmlFor={`st-ip-hidden-${section.id}`}
          hint="Hidden sections stay in Studio but not on the live site."
        >
          <div className="st-ip-fixed">
            <Toggle
              id={`st-ip-hidden-${section.id}`}
              size="sm"
              checked={section.hidden === true}
              disabled={!caps.structure}
              onCheckedChange={(c) =>
                commit({ hidden: c ? true : undefined }, c ? "Hide section" : "Show section")
              }
            />
          </div>
        </PropRow>
      )}
      {caps.exact && (
        <PropRow
          label="Locked"
          htmlFor={`st-ip-lock-${section.id}`}
          hint="Editors can change words and images only."
        >
          <div className="st-ip-fixed">
            <Toggle
              id={`st-ip-lock-${section.id}`}
              size="sm"
              checked={section.locked === true}
              onCheckedChange={(c) =>
                commit({ locked: c ? true : undefined }, c ? "Lock section" : "Unlock section")
              }
            />
          </div>
        </PropRow>
      )}
    </PanelSection>
  );
}
