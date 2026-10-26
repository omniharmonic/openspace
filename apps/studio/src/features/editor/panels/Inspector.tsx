import type { SiteDocument } from "@openspace/schema";
import { MousePointer2 } from "lucide-react";
import { EmptyState, Tabs } from "../../../ui";
import { BlockIcon } from "../blockIcons";
import { useDocStore } from "../model/context";
import { blockLabel, blockName, locate, sectionLabel } from "../model/selection";
import { THEME_LABEL } from "../model/themes";

function SelectionSummary() {
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const selection = useDocStore((s) => s.selection);
  if (!selection.length)
    return (
      <EmptyState
        size="sm"
        icon={<MousePointer2 />}
        title="Nothing selected"
        description="Click anything on the page to change its words, images or style."
      />
    );
  if (selection.length > 1)
    return (
      <div className="st-insp">
        <p className="st-insp__title">
          {selection.length} {selection[0]?.kind === "block" ? "blocks" : "sections"} selected
        </p>
        <p className="st-insp__hint">Duplicate, move or delete them together.</p>
      </div>
    );
  const item = selection[0];
  const loc = item ? locate(doc, pageId, item) : undefined;
  if (!item || !loc) return null;
  const sectionName = sectionLabel(doc, loc.section, loc.sectionIndex);
  const where =
    loc.container === "footer"
      ? "Footer (every page)"
      : doc.pages[pageId as keyof SiteDocument["pages"]]?.title;
  if (loc.block) {
    const block = loc.block;
    return (
      <div className="st-insp">
        <p className="st-insp__title">
          <BlockIcon type={block.type} />
          {blockName(block)}
        </p>
        <dl className="st-insp__facts">
          {block.label && (
            <>
              <dt>Type</dt>
              <dd>{blockLabel(block.type)}</dd>
            </>
          )}
          <dt>Section</dt>
          <dd>{sectionName}</dd>
          <dt>Page</dt>
          <dd>{where}</dd>
          {block.variant && (
            <>
              <dt>Variant</dt>
              <dd>{block.variant}</dd>
            </>
          )}
        </dl>
        <p className="st-insp__hint">
          {block.hidden
            ? "Hidden on the live site. Show it again from Layers."
            : "Double-click any words on the page to edit them. Style controls for this block appear here."}
        </p>
      </div>
    );
  }
  const s = loc.section;
  return (
    <div className="st-insp">
      <p className="st-insp__title">{sectionName}</p>
      <dl className="st-insp__facts">
        <dt>Layout</dt>
        <dd>
          {s.layout.mode === "stack"
            ? `Stack, ${s.layout.columns.d.length} column${s.layout.columns.d.length > 1 ? "s" : ""}`
            : "Grid"}
        </dd>
        <dt>Color theme</dt>
        <dd>{THEME_LABEL[s.style.colorTheme ?? "light"]}</dd>
        <dt>Blocks</dt>
        <dd>{s.blocks.length}</dd>
        <dt>Page</dt>
        <dd>{where}</dd>
        {s.hidden && (
          <>
            <dt>Visibility</dt>
            <dd>Hidden on the live site</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function PageSummary() {
  const page = useDocStore((s) => s.doc.pages[s.pageId as keyof SiteDocument["pages"]]);
  if (!page) return null;
  return (
    <div className="st-insp">
      <p className="st-insp__title">{page.title}</p>
      <dl className="st-insp__facts">
        <dt>Address</dt>
        <dd>/{page.slug}</dd>
        <dt>Sections</dt>
        <dd>{page.sections.length}</dd>
        {page.seo?.description && (
          <>
            <dt>Description</dt>
            <dd>{page.seo.description}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Right panel. Shows what's selected; the design controls arrive with the full inspector. */
export function Inspector() {
  return (
    <Tabs
      aria-label="Inspector"
      items={[
        { value: "design", label: "Design", content: <SelectionSummary /> },
        { value: "page", label: "Page", content: <PageSummary /> },
      ]}
    />
  );
}
