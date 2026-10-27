import { designerComponents } from "@omniharmonic/openspace-blocks";
import { SectionView } from "@omniharmonic/openspace-renderer";
import {
  type ComponentDefinition,
  componentSection,
  type Page,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { memo, useMemo } from "react";
import { PreviewFrame } from "./PreviewFrame";

/** A designer section the gallery offers: one the site has, or one from the library. */
export interface DesignerChoice {
  def: ComponentDefinition;
  inSite: boolean;
}

/** The site's components first, then library components the site doesn't have yet. */
export function designerChoices(doc: SiteDocument): DesignerChoice[] {
  const site = Object.values(doc.components ?? {}).map((def) => ({ def, inSite: true }));
  const names = new Set(site.map((c) => c.def.name));
  const library = designerComponents
    .filter((d) => !names.has(d.name))
    .map((def) => ({ def, inSite: false }));
  return [...site, ...library];
}

export function matchesDesigner(c: DesignerChoice, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [
    c.def.label,
    c.def.description ?? "",
    c.def.category ?? "",
    ...(c.def.tags ?? []),
    "designer custom component",
  ]
    .join(" ")
    .toLowerCase();
  return words.every((w) => text.includes(w));
}

const demos = new Map<object, Section>();
function demoOf(def: ComponentDefinition): Section {
  let s = demos.get(def);
  if (!s) {
    s = componentSection(def);
    demos.set(def, s);
  }
  return s;
}

const DesignerThumb = memo(function DesignerThumb({
  def,
  doc,
  page,
  width,
}: {
  def: ComponentDefinition;
  doc: SiteDocument;
  page: Page | undefined;
  width: number;
}) {
  const view = useMemo(
    () => ({ ...doc, components: { ...(doc.components ?? {}), [def.name]: def } }),
    [doc, def],
  );
  return (
    <PreviewFrame
      doc={view}
      page={page}
      width={1280}
      displayWidth={width}
      maxHeight={1000}
      title={`${def.label} preview`}
    >
      <SectionView section={demoOf(def)} />
    </PreviewFrame>
  );
});

/** The "Designer components" group of the Add section gallery. */
export function DesignerGroup({
  choices,
  doc,
  page,
  width,
  canAddNew,
  showTitle,
  onPick,
}: {
  choices: DesignerChoice[];
  doc: SiteDocument;
  page: Page | undefined;
  width: number;
  /** Library components can be added to the site (owners and designers). */
  canAddNew: boolean;
  showTitle: boolean;
  onPick: (def: ComponentDefinition) => void;
}) {
  if (!choices.length) return null;
  return (
    <section className="st-gal__group" aria-label="Designer components">
      {showTitle && <h3 className="st-gal__group-title">Designer components</h3>}
      <p className="st-gal__note">
        Distinctive sections with their own design. You still change their words and pictures like
        any other section.
      </p>
      <div className="st-gal__grid">
        {choices.map((c) => {
          const blocked = !c.inSite && !canAddNew;
          return (
            <button
              key={c.def.name}
              type="button"
              className="st-gal__card"
              disabled={blocked}
              data-designer={c.def.name}
              aria-label={`${c.def.label}: ${c.def.description ?? "Designer section"}`}
              title={blocked ? "Ask the site’s designer to add this design first" : undefined}
              onClick={() => onPick(c.def)}
            >
              <DesignerThumb def={c.def} doc={doc} page={page} width={width} />
              <span className="st-gal__name">
                {c.def.label}
                {c.inSite ? "" : " · new"}
              </span>{" "}
              <span className="st-gal__desc">{c.def.description ?? "Designer section"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
