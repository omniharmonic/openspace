import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import type { Block, JsonValue, Section, SiteDocument } from "@omniharmonic/openspace-schema";
import { LayoutPanelTop, Monitor, MousePointer2, Plus, Smartphone, Tablet } from "lucide-react";
import { useMemo } from "react";
import { Button, EmptyState, Segmented, Tabs, Toggle } from "../../ui";
import { useBlockMenu } from "../add-section/blockMenuStore";
import { BlockIcon } from "../editor/blockIcons";
import { type Breakpoint, useEditorUi } from "../editor/editor-store";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { blockLabel, blockName, locate, sectionLabel } from "../editor/model/selection";
import { measureBlock } from "./canvasDoc";
import { BlockDesign } from "./design/BlockDesign";
import { SectionDesign } from "./design/SectionDesign";
import { useEditBp, useInspectorRole, useInspectorTab } from "./env";
import { GroupedFields } from "./fields/FieldsEditor";
import { FieldsContext, friendlyError } from "./fields/types";
import { fieldsOp } from "./model/edits";
import { type Capabilities, capabilities } from "./model/permissions";
import { BP_LABEL } from "./model/responsive";
import { OverrideDot, PanelSection, PropRow, RoleNote } from "./ui";
import "./inspector.css";

const DEVICE_ICON: Record<Breakpoint, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

/** Which breakpoint design edits target; switching it switches the canvas device (FR-15). */
function BreakpointBar() {
  const breakpoint = useEditorUi((s) => s.breakpoint);
  const bp = useEditBp();
  return (
    <div className="st-ip__bp" data-ip-nav="">
      <Segmented<Breakpoint>
        aria-label="Edit styles for"
        size="sm"
        block
        value={breakpoint}
        onValueChange={(b) => useEditorUi.getState().setBreakpoint(b)}
        options={(["desktop", "tablet", "mobile"] as const).map((b) => {
          const Icon = DEVICE_ICON[b];
          return {
            value: b,
            label: (
              <>
                <Icon />
                {BP_LABEL[b === "desktop" ? "d" : b === "tablet" ? "t" : "m"]}
              </>
            ),
          };
        })}
      />
      {bp !== "d" && (
        <p className="st-ip__bp-note">
          <OverrideDot bps={[bp]} />
          Changes here apply to {BP_LABEL[bp].toLowerCase()}s only. Linked values follow
          {bp === "m" ? " tablet" : " desktop"}.
        </p>
      )}
    </div>
  );
}

function BlockContent({
  block,
  container,
  caps,
}: {
  block: Block;
  container: string;
  caps: Capabilities;
}) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const def = blocksRegistry().get(block.type);
  const ctx = useMemo(() => ({ doc, pageId, block, caps }), [doc, pageId, block, caps]);
  if (!def)
    return (
      <RoleNote>
        This block type isn’t in this version of OpenSpace, so it can’t be edited here.
      </RoleNote>
    );
  const onField = (
    key: string,
    value: unknown,
    options: { merge?: boolean; label?: string } = {},
  ) => {
    const r = api.getState().commit([fieldsOp(container, block, { [key]: value })], {
      label: options.label ?? `Edit ${(def.meta.fields[key]?.label ?? key).toLowerCase()}`,
      ...(options.merge ? { mergeKey: `field:${block.id}:${key}` } : {}),
    });
    return r.ok ? null : friendlyError(r.errors[0]?.message);
  };
  return (
    <FieldsContext.Provider value={ctx}>
      {caps.note && !caps.field("list") && <RoleNote>{caps.note}</RoleNote>}
      <GroupedFields
        fields={def.meta.fields}
        values={block.fields}
        onField={onField}
        idPrefix={`st-ip-${block.id}`}
        defaults={def.meta.defaults.fields as Record<string, JsonValue>}
      />
      <PanelSection title="Block" defaultOpen={false}>
        <PropRow label="Name" hint="Shown in Layers.">
          <input
            className="st-input st-input--sm st-ip-plaininput"
            aria-label="Block name"
            key={block.label ?? ""}
            defaultValue={block.label ?? ""}
            placeholder={blockLabel(block.type)}
            disabled={!caps.blockDesign}
            onBlur={(e) => {
              const v = e.target.value.trim().slice(0, 80);
              if (v !== (block.label ?? ""))
                api.getState().commit(
                  [
                    {
                      op: "block.update",
                      page: container,
                      block: block.id,
                      label: v || null,
                    } as never,
                  ],
                  { label: "Rename block" },
                );
            }}
          />
        </PropRow>
        <PropRow
          label="Hidden"
          htmlFor={`st-ip-bh-${block.id}`}
          hint="Hidden blocks stay in Studio but not on the live site."
        >
          <div className="st-ip-fixed">
            <Toggle
              id={`st-ip-bh-${block.id}`}
              size="sm"
              checked={block.hidden === true}
              disabled={!caps.blockDesign}
              onCheckedChange={(c) =>
                api.getState().commit(
                  [
                    {
                      op: "block.update",
                      page: container,
                      block: block.id,
                      hidden: c ? true : null,
                    } as never,
                  ],
                  { label: c ? "Hide block" : "Show block" },
                )
              }
            />
          </div>
        </PropRow>
      </PanelSection>
    </FieldsContext.Provider>
  );
}

function SectionBlocks({ section, caps }: { section: Section; caps: Capabilities }) {
  const api = useDocStoreApi();
  return (
    <PanelSection title="Blocks" count={section.blocks.length}>
      <ul className="st-ip-choices" aria-label="Blocks in this section" data-ip-nav="">
        {section.blocks.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className="st-ip-choice"
              onClick={() => api.getState().select({ kind: "block", id: b.id })}
            >
              <BlockIcon type={b.type} />
              {blockName(b)}
              {section.layout.mode === "stack" && section.layout.columns.d.length > 1 && (
                <span className="st-ip-choice__meta">Column {(b.column ?? 0) + 1}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {section.layout.mode === "stack" && section.layout.columns.d.length > 1 ? (
        <div className="st-ip-btnrow">
          {section.layout.columns.d.map((_, c) => (
            <Button
              // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
              key={c}
              size="sm"
              variant="secondary"
              icon={<Plus />}
              disabled={!caps.structure}
              aria-label={`Add a block to column ${c + 1}`}
              onClick={() => useBlockMenu.getState().openFor({ section: section.id, column: c })}
            >
              Column {c + 1}
            </Button>
          ))}
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          className="st-ip-add"
          disabled={!caps.structure}
          onClick={() => useBlockMenu.getState().openFor({ section: section.id })}
        >
          Add block
        </Button>
      )}
    </PanelSection>
  );
}

function Header({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="st-ip__head">
      <span className="st-ip__icon">{icon}</span>
      <div className="st-ip__name">
        <div className="st-ip__title">{title}</div>
        {sub && <div className="st-ip__sub">{sub}</div>}
      </div>
    </div>
  );
}

function PageInfo({ doc, pageId }: { doc: SiteDocument; pageId: string }) {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  return (
    <div className="st-ip-empty">
      <EmptyState
        size="sm"
        icon={<MousePointer2 />}
        title="Nothing selected"
        description={`Click anything on ${page?.title ?? "the page"} to change its words, images or style. Press / to add a block.`}
      />
    </div>
  );
}

/** The right panel: content and design for whatever is selected. */
export function Inspector() {
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const selection = useDocStore((s) => s.selection);
  const role = useInspectorRole();
  const tab = useInspectorTab((s) => s.tab);
  const item = selection.length === 1 ? selection[0] : undefined;
  const loc = item ? locate(doc, pageId, item) : undefined;
  const caps = useMemo(() => capabilities(role, loc?.section), [role, loc?.section]);

  let body: React.ReactNode;
  if (!selection.length || (item && !loc)) body = <PageInfo doc={doc} pageId={pageId} />;
  else if (selection.length > 1)
    body = (
      <>
        <Header
          icon={<LayoutPanelTop />}
          title={`${selection.length} ${selection[0]?.kind === "block" ? "blocks" : "sections"} selected`}
          sub="Duplicate, move or delete them together"
        />
        <p className="st-ip-note">Select one item to change its content and design.</p>
      </>
    );
  else if (loc?.block) {
    const block = loc.block;
    const where = sectionLabel(doc, loc.section, loc.sectionIndex);
    body = (
      <>
        <Header
          icon={<BlockIcon type={block.type} />}
          title={blockName(block)}
          sub={`${blockLabel(block.type)} · ${where}`}
        />
        <Tabs
          className="st-ip__tabs"
          aria-label="Block inspector"
          value={tab}
          onValueChange={(v) => useInspectorTab.setState({ tab: v as "content" | "design" })}
          items={[
            {
              value: "content",
              label: "Content",
              content: <BlockContent block={block} container={loc.container} caps={caps} />,
            },
            {
              value: "design",
              label: "Design",
              content: (
                <>
                  <BreakpointBar />
                  <BlockDesign block={block} container={loc.container} caps={caps} />
                </>
              ),
            },
          ]}
        />
      </>
    );
  } else if (loc) {
    const s = loc.section;
    body = (
      <>
        <Header
          icon={<LayoutPanelTop />}
          title={sectionLabel(doc, s, loc.sectionIndex)}
          sub={
            loc.container === "footer"
              ? "Footer · every page"
              : `Section · ${s.layout.mode === "stack" ? "Stack" : "Grid"}`
          }
        />
        <div className="st-ip__scroll">
          <BreakpointBar />
          <SectionDesign section={s} container={loc.container} caps={caps} measure={measureBlock} />
          <SectionBlocks section={s} caps={caps} />
        </div>
      </>
    );
  }
  return (
    <div className="st-ip" data-testid="inspector">
      {body}
    </div>
  );
}
