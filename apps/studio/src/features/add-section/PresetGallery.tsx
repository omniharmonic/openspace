import {
  allPresets,
  PRESET_CATEGORIES,
  PRESET_CATEGORY_LABELS,
  type Preset,
  type PresetCategory,
} from "@omniharmonic/openspace-blocks";
import { Footer, Header, SectionView } from "@omniharmonic/openspace-renderer";
import type { Page, Section, SiteDocument } from "@omniharmonic/openspace-schema";
import { Search } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { cx, Input, Select } from "../../ui";
import { isHeaderPreset } from "./insert";
import { PreviewFrame } from "./PreviewFrame";
import "./add-section.css";

/** Device width presets are rendered at (a desktop page). */
const RENDER_WIDTH = 1280;
/** Headers render narrower (still the desktop layout) so their navigation stays legible. */
const HEADER_RENDER_WIDTH = 1024;

const built = new Map<string, unknown>();
/** One demo build per preset for thumbnails (inserting builds again, with fresh ids). */
function demoOf(preset: Preset): unknown {
  let v = built.get(preset.id);
  if (!v) {
    v = preset.build();
    built.set(preset.id, v);
  }
  return v;
}

export const PresetThumb = memo(function PresetThumb({
  preset,
  doc,
  page,
  width,
}: {
  preset: Preset;
  doc: SiteDocument;
  page: Page | undefined;
  width: number;
}) {
  const demo = demoOf(preset);
  let content: React.ReactNode;
  if (isHeaderPreset(preset)) {
    const site = { ...doc.site, header: demo as typeof doc.site.header };
    // A header alone is a thin strip: show it above a faint page so the layout reads.
    content = (
      <>
        <Header site={site} page={page} heroTheme="light" />
        <div className="os-preview-ghost" aria-hidden="true">
          <span />
          <span />
        </div>
      </>
    );
  } else if (preset.target === "footer") {
    content = <Footer site={{ ...doc.site, footer: demo as Section }} />;
  } else content = <SectionView section={demo as Section} />;
  return (
    <PreviewFrame
      doc={doc}
      page={page}
      width={isHeaderPreset(preset) ? HEADER_RENDER_WIDTH : RENDER_WIDTH}
      displayWidth={width}
      maxHeight={isHeaderPreset(preset) ? 300 : 1000}
      title={`${preset.label} preview`}
    >
      {content}
    </PreviewFrame>
  );
});

/**
 * Search across a preset's name, description, tags, category and AI guidance (so "restaurant"
 * or "nonprofit" finds the presets written for them).
 */
export function matchesPreset(p: Preset, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    p.label,
    p.description,
    p.category,
    PRESET_CATEGORY_LABELS[p.category],
    ...p.tags,
    p.ai.purpose,
    p.ai.whenToUse,
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** Quick filters on how a preset looks, derived from its metadata. */
export const PRESET_TRAITS = [
  { id: "photo", label: "Photos", test: (p: Preset) => p.images.length > 0 },
  {
    id: "text",
    label: "Text only",
    test: (p: Preset) => p.images.length === 0 && p.target !== "header",
  },
  { id: "layered", label: "Layered", test: (p: Preset) => p.overlap },
  {
    id: "dark",
    label: "Dark",
    test: (p: Preset) => p.defaultTheme === "dark" || p.defaultTheme === "dark-accent",
  },
] as const;
export type PresetTrait = (typeof PRESET_TRAITS)[number]["id"];

export function filterPresets(
  query: string,
  category: PresetCategory | "all",
  trait: PresetTrait | null = null,
): Preset[] {
  const t = trait ? PRESET_TRAITS.find((x) => x.id === trait) : undefined;
  return allPresets.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      matchesPreset(p, query) &&
      (!t || t.test(p)),
  );
}

const NOTE: Partial<Record<Preset["target"], string>> = {
  header: "Changes the header on every page",
  footer: "Replaces the footer on every page",
};

/**
 * The "Add section" gallery: presets by category, searchable, each card a live render in
 * this site's current styles. `layout="dialog"` shows categories as a sidebar.
 */
export function PresetGallery({
  doc,
  pageId,
  layout,
  onPick,
  disabledTargets = [],
}: {
  doc: SiteDocument;
  pageId: string;
  layout: "panel" | "dialog";
  onPick: (preset: Preset) => void;
  /** Targets the person's role can't change (header/footer for editors). */
  disabledTargets?: Preset["target"][];
}) {
  const [query, setQuery] = useState("");
  const [trait, setTrait] = useState<PresetTrait | null>(null);
  const [category, setCategory] = useState<PresetCategory | "all">(
    layout === "dialog" ? "hero" : "all",
  );
  // Thumbnails depend on Site Styles, site chrome, the page list (header navigation) and the
  // media library (logos): keep their doc stable across content edits so a hundred previews
  // don't re-render on every keystroke.
  const navKey = Object.values(doc.pages)
    .map((p) => `${p.id}|${p.title}|${p.slug}`)
    .join("\n");
  const mediaKey = Object.keys(doc.media).join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on what thumbnails show
  const thumbDoc = useMemo(() => doc, [doc.styles, doc.site, doc.config, navKey, mediaKey]);
  const page = thumbDoc.pages[pageId as keyof SiteDocument["pages"]];
  const effective = query.trim() ? "all" : category;
  const presets = useMemo(() => filterPresets(query, effective, trait), [query, effective, trait]);
  // Category counts follow the search and quick filter, so empty categories drop out.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of filterPresets(query, "all", trait))
      c.set(p.category, (c.get(p.category) ?? 0) + 1);
    return c;
  }, [query, trait]);
  const allCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of allPresets) c.set(p.category, (c.get(p.category) ?? 0) + 1);
    return c;
  }, []);
  const cats = PRESET_CATEGORIES.filter((c) => allCounts.get(c));
  const width = layout === "dialog" ? 236 : 222;

  const groups = useMemo(() => {
    const out: Array<[PresetCategory, Preset[]]> = [];
    for (const c of PRESET_CATEGORIES) {
      const list = presets.filter((p) => p.category === c);
      if (list.length) out.push([c, list]);
    }
    return out;
  }, [presets]);

  const search = (
    <Input
      size="sm"
      aria-label="Search sections"
      placeholder="Search sections"
      prefix={<Search />}
      value={query}
      data-autofocus
      onChange={(e) => setQuery(e.target.value)}
    />
  );

  return (
    <div className={cx("st-gal", `st-gal--${layout}`)}>
      <div className="st-gal__bar">
        {search}
        <Select<string>
          className="st-gal__select"
          aria-label="Section category"
          size="sm"
          value={category}
          onValueChange={(v) => setCategory(v as PresetCategory | "all")}
          options={[
            { value: "all", label: "All sections" },
            ...cats.map((c) => ({
              value: c,
              label: `${PRESET_CATEGORY_LABELS[c]} (${counts.get(c) ?? 0})`,
            })),
          ]}
        />
        <fieldset className="st-gal__traits">
          <legend className="st-visually-hidden">Quick filters</legend>
          {PRESET_TRAITS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="st-gal__trait"
              aria-pressed={trait === t.id}
              onClick={() => setTrait(trait === t.id ? null : t.id)}
            >
              {t.label}
            </button>
          ))}
          <span className="st-gal__count" aria-live="polite">
            {presets.length} {presets.length === 1 ? "design" : "designs"}
          </span>
        </fieldset>
      </div>
      <div className="st-gal__main">
        {layout === "dialog" && (
          <nav className="st-gal__cats" aria-label="Section categories">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                className="st-gal__cat"
                aria-current={effective === c ? "true" : undefined}
                disabled={!counts.get(c)}
                onClick={() => {
                  setCategory(c);
                  setQuery("");
                }}
              >
                {PRESET_CATEGORY_LABELS[c]}
                <span>{counts.get(c) ?? 0}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="st-gal__list">
          {groups.map(([c, list]) => (
            <section key={c} className="st-gal__group" aria-label={PRESET_CATEGORY_LABELS[c]}>
              {(effective === "all" || layout === "panel") && (
                <h3 className="st-gal__group-title">{PRESET_CATEGORY_LABELS[c]}</h3>
              )}
              <div className="st-gal__grid">
                {list.map((p) => {
                  const blocked = disabledTargets.includes(p.target);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="st-gal__card"
                      disabled={blocked}
                      aria-label={`${p.label}: ${NOTE[p.target] ?? p.description}`}
                      title={blocked ? "Your role can’t change the header or footer" : undefined}
                      onClick={() => onPick(p)}
                    >
                      <PresetThumb preset={p} doc={thumbDoc} page={page} width={width} />
                      <span className="st-gal__name">{p.label}</span>{" "}
                      <span className="st-gal__desc">{NOTE[p.target] ?? p.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {!groups.length && (
            <p className="st-gal__empty">
              {query.trim() ? `No sections match “${query}”.` : "No sections match this filter."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
