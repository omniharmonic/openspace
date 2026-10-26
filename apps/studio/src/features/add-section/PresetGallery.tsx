import {
  allPresets,
  PRESET_CATEGORIES,
  PRESET_CATEGORY_LABELS,
  type Preset,
  type PresetCategory,
} from "@openspace/blocks";
import { Footer, Header, SectionView } from "@openspace/renderer";
import type { Page, Section, SiteDocument } from "@openspace/schema";
import { Search } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { cx, Input, Select } from "../../ui";
import { isHeaderPreset } from "./insert";
import { PreviewFrame } from "./PreviewFrame";
import "./add-section.css";

/** Device width presets are rendered at (a desktop page). */
const RENDER_WIDTH = 1280;

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
    content = <Header site={site} page={page} heroTheme="light" />;
  } else if (preset.target === "footer") {
    content = <Footer site={{ ...doc.site, footer: demo as Section }} />;
  } else content = <SectionView section={demo as Section} />;
  return (
    <PreviewFrame
      doc={doc}
      page={page}
      width={RENDER_WIDTH}
      displayWidth={width}
      maxHeight={isHeaderPreset(preset) ? 240 : 1000}
      title={`${preset.label} preview`}
    >
      {content}
    </PreviewFrame>
  );
});

/** Search across a preset's name, description, tags and category. */
export function matchesPreset(p: Preset, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [p.label, p.description, p.category, PRESET_CATEGORY_LABELS[p.category], ...p.tags]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function filterPresets(query: string, category: PresetCategory | "all"): Preset[] {
  return allPresets.filter(
    (p) => (category === "all" || p.category === category) && matchesPreset(p, query),
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
  const [category, setCategory] = useState<PresetCategory | "all">(
    layout === "dialog" ? "hero" : "all",
  );
  // Thumbnails depend on Site Styles and site chrome only: keep their doc stable across content
  // edits so a hundred previews don't re-render on every keystroke.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately keyed on styles and site
  const thumbDoc = useMemo(() => doc, [doc.styles, doc.site, doc.config]);
  const page = thumbDoc.pages[pageId as keyof SiteDocument["pages"]];
  const effective = query.trim() ? "all" : category;
  const presets = useMemo(() => filterPresets(query, effective), [query, effective]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of allPresets) c.set(p.category, (c.get(p.category) ?? 0) + 1);
    return c;
  }, []);
  const cats = PRESET_CATEGORIES.filter((c) => counts.get(c));
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
        {layout === "panel" && (
          <Select<string>
            aria-label="Section category"
            size="sm"
            value={category}
            onValueChange={(v) => setCategory(v as PresetCategory | "all")}
            options={[
              { value: "all", label: "All sections" },
              ...cats.map((c) => ({
                value: c,
                label: `${PRESET_CATEGORY_LABELS[c]} (${counts.get(c)})`,
              })),
            ]}
          />
        )}
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
                onClick={() => {
                  setCategory(c);
                  setQuery("");
                }}
              >
                {PRESET_CATEGORY_LABELS[c]}
                <span>{counts.get(c)}</span>
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
                      aria-label={`${p.label}: ${p.description}`}
                      title={blocked ? "Your role can’t change the header or footer" : undefined}
                      onClick={() => onPick(p)}
                    >
                      <PresetThumb preset={p} doc={thumbDoc} page={page} width={width} />
                      <span className="st-gal__name">{p.label}</span>
                      <span className="st-gal__desc">{NOTE[p.target] ?? p.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {!groups.length && <p className="st-gal__empty">No sections match “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}
