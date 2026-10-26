import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { blockText } from "@openspace/lint";
import type { Section, SiteDocument } from "@openspace/schema";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  ChevronRight,
  Copy,
  Ellipsis,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  GripVertical,
  History,
  Image as ImageIcon,
  LayoutGrid,
  ListOrdered,
  Lock,
  Palette,
  PanelTop,
  Pencil,
  Plus,
  Redo2,
  Rows3,
  SearchCheck,
  Settings,
  Trash2,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Button, cx, IconButton, Sheet, Spinner, toast } from "../../ui";
import { useAddSection, useBlockMenu } from "../add-section/blockMenuStore";
import { DesignCheckPanel } from "../design-check/DesignCheckPanel";
import type { CheckedIssue } from "../design-check/model";
import { useDesignCheck } from "../design-check/store";
import { BlockIcon } from "../editor/blockIcons";
import { Canvas } from "../editor/canvas/Canvas";
import { type LeftPanel, useEditorUi } from "../editor/editor-store";
import { gridCaps } from "../editor/grid/caps";
import { isGridSection } from "../editor/grid/model";
import { PhoneReorder } from "../editor/grid/PhoneReorder";
import { deleteItems, duplicateItems, moveSectionTo, toggleHidden } from "../editor/model/actions";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { blockName, sectionLabel } from "../editor/model/selection";
import { useCanvasDocument } from "../inspector/canvasDoc";
import { useInspectorRole } from "../inspector/env";
import { Inspector } from "../inspector/Inspector";
import { capabilities } from "../inspector/model/permissions";
import { useLookTrial } from "../looks/trial";
import { MediaLibrary } from "../media/MediaLibrary";
import { useUploader } from "../media/useUploader";
import { PagesManager } from "../pages/PagesManager";
import { SiteChromePanel } from "../site-chrome/SiteChromePanel";
import { useManageUi } from "../site-mgmt/manage-ui";
import { PublishButton, PublishPill } from "../sync/PublishFlow";
import { SyncBanners, SyncStatus } from "../sync/SyncChrome";
import { UpdateBanner } from "../updates/UpdateBanner";
import { imageFieldOf, setBlockImage, waitForMedia } from "./replaceImage";
import "./mobile.css";

const SiteStylesPanel = lazy(() =>
  import("../styles/SiteStylesPanel").then((m) => ({ default: m.SiteStylesPanel })),
);
const LooksPanel = lazy(() =>
  import("../looks/LooksPanel").then((m) => ({ default: m.LooksPanel })),
);
const LookStage = lazy(() => import("../looks/LooksPanel").then((m) => ({ default: m.LookStage })));

export type MobileScreen = "pages" | "sections" | "preview";

type SheetState =
  | { kind: "section"; section: string; block?: string }
  | { kind: "panel"; panel: LeftPanel }
  | { kind: "more" }
  | null;

/** Pages in navigation order (folders flattened), then pages not in the navigation. */
export function pagesInOrder(
  doc: SiteDocument,
): SiteDocument["pages"][keyof SiteDocument["pages"]][] {
  const ids: string[] = [];
  for (const item of doc.site.nav) {
    if (item.type === "page") ids.push(item.page);
    if (item.type === "folder") {
      if (item.page) ids.push(item.page);
      for (const child of item.items) if (child.type === "page") ids.push(child.page);
    }
  }
  const all = Object.values(doc.pages);
  const home = all.find((p) => p.slug === "");
  const ordered = [...(home ? [home.id as string] : []), ...ids, ...all.map((p) => p.id as string)];
  const seen = new Set<string>();
  const out = [];
  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const p = doc.pages[id as keyof SiteDocument["pages"]];
    if (p) out.push(p);
  }
  return out;
}

/** The words a section starts with (its first heading or text), for the section list. */
export function sectionSummary(section: Section): string {
  for (const b of section.blocks) {
    const text = blockText(b).replace(/\s+/g, " ").trim();
    if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  }
  return section.blocks.length ? `${section.blocks.length} blocks` : "Empty section";
}

// --- pages --------------------------------------------------------------------------------------

function PageList({ onOpen }: { onOpen: (pageId: string) => void }) {
  const doc = useDocStore((s) => s.doc);
  const current = useDocStore((s) => s.pageId);
  const pages = pagesInOrder(doc);
  return (
    <div className="st-mob__screen" data-testid="mobile-pages">
      <h1 className="st-mob__h1">Pages</h1>
      <ul className="st-mob__list" aria-label="Pages">
        {pages.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={cx("st-mob__row", p.id === current && "is-current")}
              onClick={() => onOpen(p.id)}
            >
              <FileText aria-hidden="true" className="st-mob__row-icon" />
              <span className="st-mob__row-text">
                <span className="st-mob__row-title">{p.title}</span>
                <span className="st-mob__row-sub">
                  /{p.slug}
                  {p.hidden ? " · hidden" : ""} · {p.sections.length}{" "}
                  {p.sections.length === 1 ? "section" : "sections"}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="st-mob__chev" />
            </button>
          </li>
        ))}
      </ul>
      <div className="st-mob__actions">
        <Button
          variant="secondary"
          icon={<FilePlus2 />}
          onClick={() => useManageUi.getState().openAddPage()}
        >
          Add page
        </Button>
      </div>
    </div>
  );
}

// --- sections -----------------------------------------------------------------------------------

function SortableSection({
  section,
  index,
  doc,
  canReorder,
  onOpen,
}: {
  section: Section;
  index: number;
  doc: SiteDocument;
  canReorder: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: !canReorder });
  const name = sectionLabel(doc, section, index);
  return (
    <li
      ref={setNodeRef}
      className={cx("st-mob__srow", isDragging && "is-dragging")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="st-mob__grip"
        aria-label={`Reorder ${name}`}
        disabled={!canReorder}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <button type="button" className="st-mob__row st-mob__row--section" onClick={onOpen}>
        <span className="st-mob__row-text">
          <span className="st-mob__row-title">
            {name}
            {section.hidden && <EyeOff aria-label="Hidden" className="st-mob__flag" />}
            {section.locked && <Lock aria-label="Locked" className="st-mob__flag" />}
            {section.layout.mode === "grid" && (
              <LayoutGrid aria-label="Grid section" className="st-mob__flag" />
            )}
          </span>
          <span className="st-mob__row-sub">{sectionSummary(section)}</span>
        </span>
        <Pencil aria-hidden="true" className="st-mob__chev" />
      </button>
    </li>
  );
}

function SectionList({ onOpen }: { onOpen: (sectionId: string) => void }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const caps = capabilities(role);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!page) return null;
  const ids = page.sections.map((s) => s.id as string);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const to = ids.indexOf(String(e.over.id));
    if (to < 0) return;
    api.getState().run(moveSectionTo(pageId, String(e.active.id), to));
  };
  return (
    <div className="st-mob__screen" data-testid="mobile-sections">
      <h1 className="st-mob__h1">{page.title}</h1>
      <p className="st-mob__lede">
        Tap a section to edit its words and photos. Drag the handle to reorder.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="st-mob__list" aria-label={`Sections on ${page.title}`}>
            {page.sections.map((s, i) => (
              <SortableSection
                key={s.id}
                section={s}
                index={i}
                doc={doc}
                canReorder={caps.structure}
                onOpen={() => onOpen(s.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <ul className="st-mob__list st-mob__list--footer" aria-label="On every page">
        <li>
          <button type="button" className="st-mob__row" onClick={() => onOpen(doc.site.footer.id)}>
            <PanelTop aria-hidden="true" className="st-mob__row-icon st-mob__flip" />
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">Footer</span>
              <span className="st-mob__row-sub">On every page</span>
            </span>
            <Pencil aria-hidden="true" className="st-mob__chev" />
          </button>
        </li>
      </ul>
      {caps.structure && (
        <div className="st-mob__actions">
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => useAddSection.getState().openAt("end")}
          >
            Add section
          </Button>
        </div>
      )}
    </div>
  );
}

// --- the section sheet --------------------------------------------------------------------------

function ReplacePhoto({
  site,
  container,
  blockId,
}: {
  site: Site;
  container: string;
  blockId: string;
}) {
  const api = useDocStoreApi();
  const uploader = useUploader(site);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file || !uploader) return;
    setBusy(true);
    try {
      const [res] = await uploader.add([file]);
      if (!res) return;
      const meta = await waitForMedia(api, res.path);
      if (!meta) {
        toast({
          title: "Your photo is still uploading",
          description: "It will be in Media when it’s done; choose it from there.",
        });
        return;
      }
      const err = setBlockImage(api, container, blockId, res.path);
      if (err) toast({ tone: "danger", title: "Couldn’t use that photo", description: err });
      else toast({ tone: "success", title: "Photo replaced" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={busy ? <Spinner size={12} /> : <Camera />}
        disabled={busy || !uploader}
        onClick={() => input.current?.click()}
      >
        {busy ? "Adding…" : "Replace photo"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid={`replace-photo-${blockId}`}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </>
  );
}

function SectionSheetBody({
  site,
  sectionId,
  blockId,
  onBlock,
  onClose,
}: {
  site: Site;
  sectionId: string;
  blockId: string | undefined;
  onBlock: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const [reorder, setReorder] = useState(false);
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const footer = doc.site.footer.id === sectionId;
  const index = page?.sections.findIndex((s) => s.id === sectionId) ?? -1;
  const section = footer ? doc.site.footer : page?.sections[index];
  if (!section) return <p className="st-mob__lede">This section was removed.</p>;
  const container = footer ? "footer" : pageId;
  const caps = capabilities(role, section);
  const s = () => api.getState();

  if (blockId && section.blocks.some((b) => b.id === blockId)) {
    return (
      <div className="st-mob__blockedit">
        <button type="button" className="st-mob__back" onClick={() => onBlock(undefined)}>
          <ArrowLeft aria-hidden="true" /> {sectionLabel(doc, section, index)}
        </button>
        <Inspector />
      </div>
    );
  }

  const count = page?.sections.length ?? 0;
  const sel = [{ kind: "section" as const, id: section.id as string }];
  return (
    <div className="st-mob__sectionedit">
      {!footer && caps.structure && (
        <div className="st-mob__toolbar" role="toolbar" aria-label="Section">
          <IconButton
            label="Move up"
            icon={<ArrowUp />}
            tooltip={false}
            disabled={index <= 0}
            onClick={() => s().run(moveSectionTo(pageId, section.id, index - 1))}
          />
          <IconButton
            label="Move down"
            icon={<ArrowDown />}
            tooltip={false}
            disabled={index >= count - 1}
            onClick={() => s().run(moveSectionTo(pageId, section.id, index + 1))}
          />
          <IconButton
            label="Duplicate"
            icon={<Copy />}
            tooltip={false}
            onClick={() => s().run(duplicateItems(s().doc, pageId, sel))}
          />
          <IconButton
            label={section.hidden ? "Show on the site" : "Hide on the site"}
            icon={section.hidden ? <Eye /> : <EyeOff />}
            tooltip={false}
            disabled={!caps.sectionDesign}
            onClick={() => s().run(toggleHidden(s().doc, pageId, section))}
          />
          <IconButton
            label="Delete section"
            icon={<Trash2 />}
            tooltip={false}
            onClick={() => {
              s().run(deleteItems(s().doc, pageId, sel));
              onClose();
              toast({
                title: "Section deleted",
                action: { label: "Undo", onClick: () => api.getState().undo() },
              });
            }}
          />
        </div>
      )}
      <ul className="st-mob__list" aria-label="Blocks in this section">
        {section.blocks.map((b) => {
          const text = blockText(b).replace(/\s+/g, " ").trim();
          const photo = imageFieldOf(b);
          return (
            <li key={b.id} className="st-mob__brow">
              <button
                type="button"
                className="st-mob__row"
                onClick={() => {
                  s().select({ kind: "block", id: b.id });
                  onBlock(b.id);
                }}
              >
                <BlockIcon type={b.type} />
                <span className="st-mob__row-text">
                  <span className="st-mob__row-title">{blockName(b)}</span>
                  {text && <span className="st-mob__row-sub">{text}</span>}
                </span>
                <ChevronRight aria-hidden="true" className="st-mob__chev" />
              </button>
              {photo && caps.field("image") && (
                <div className="st-mob__rowaction">
                  <ImageIcon aria-hidden="true" />
                  <ReplacePhoto site={site} container={container} blockId={b.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="st-mob__actions">
        {caps.structure && (
          <Button
            variant="secondary"
            icon={<Plus />}
            onClick={() => useBlockMenu.getState().openFor({ section: section.id })}
          >
            Add block
          </Button>
        )}
        {isGridSection(section) && (
          <>
            <Button variant="secondary" icon={<ListOrdered />} onClick={() => setReorder(true)}>
              Order on phones
            </Button>
            <PhoneReorder section={section} open={reorder} onOpenChange={setReorder} />
          </>
        )}
      </div>
      {isGridSection(section) && !gridCaps(role, section).edit && (
        <p className="st-mob__lede">{gridCaps(role, section).reason}</p>
      )}
    </div>
  );
}

// --- the shell ----------------------------------------------------------------------------------

const MORE: Array<{ panel: LeftPanel; label: string; icon: ReactNode }> = [
  { panel: "styles", label: "Site styles", icon: <Palette /> },
  { panel: "looks", label: "Try a new look", icon: <WandSparkles /> },
  { panel: "media", label: "Media", icon: <ImageIcon /> },
  { panel: "chrome", label: "Header & footer", icon: <PanelTop /> },
  { panel: "pages", label: "Navigation and page settings", icon: <FileText /> },
];

const PANEL_TITLE: Partial<Record<LeftPanel, string>> = {
  styles: "Site styles",
  looks: "Try a new look",
  media: "Media",
  chrome: "Header & footer",
  pages: "Pages",
  check: "Design check",
};

function PanelBody({ panel }: { panel: LeftPanel }) {
  if (panel === "media") return <MediaLibrary />;
  if (panel === "chrome") return <SiteChromePanel />;
  if (panel === "pages") return <PagesManager />;
  return (
    <Suspense fallback={<Spinner size={14} label="Loading" />}>
      {panel === "styles" ? <SiteStylesPanel /> : <LooksPanel />}
    </Suspense>
  );
}

export interface MobileStudioProps {
  site: Site;
  /** Open the history sheet (owned by the editor). */
  onHistory: () => void;
  onFrameDocument: (doc: Document | null) => void;
}

/**
 * Studio on a phone (arch §5.7, FR-22): page list → section list → tap to edit in a bottom
 * sheet; reorder sections by their handle; add sections from presets; replace photos from the
 * camera roll; preview and edit text inline on the real page; publish. Grid placement is
 * tablet-and-up: phones get the simplified "Order on phones" list.
 */
export function MobileStudio({ site, onHistory, onFrameDocument }: MobileStudioProps) {
  const navigate = useNavigate();
  const api = useDocStoreApi();
  const pageTitle = useDocStore(
    (s) => s.doc.pages[s.pageId as keyof SiteDocument["pages"]]?.title ?? site.name,
  );
  const canUndo = useDocStore((s) => s.undoStack.length > 0);
  const canRedo = useDocStore((s) => s.redoStack.length > 0);
  const selection = useDocStore((s) => s.selection);
  const attention = useDesignCheck((s) => s.counts.attention);
  const trying = useLookTrial((s) => s.templateId !== null);
  const requested = useEditorUi((s) => s.leftPanel);
  const [screen, setScreen] = useState<MobileScreen>("sections");
  const [sheet, setSheet] = useState<SheetState>(null);
  // Panels opened from elsewhere (the publish dialog's "Review issues") open as sheets here.
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested === "check") setSheet({ kind: "panel", panel: "check" });
  }
  const building = site.status === "building";
  const s = () => api.getState();

  const openSection = (section: string, block?: string) => {
    if (block) s().select({ kind: "block", id: block });
    else s().select({ kind: "section", id: section });
    setSheet({ kind: "section", section, ...(block ? { block } : {}) });
  };

  const jump = (issue: CheckedIssue) => {
    if (issue.page && issue.page !== "footer") s().setPage(issue.page);
    setScreen("sections");
    const section = issue.page === "footer" ? s().doc.site.footer.id : issue.section;
    if (section) openSection(section, issue.block);
    else setSheet(null);
  };

  // A block tapped on the preview opens in the sheet.
  const selected = selection.length === 1 ? selection[0] : undefined;
  const selectedSection = (() => {
    if (!selected) return undefined;
    const d = s().doc;
    const page = d.pages[s().pageId as keyof SiteDocument["pages"]];
    for (const sec of [...(page?.sections ?? []), d.site.footer]) {
      if (selected.kind === "section" && sec.id === selected.id) return sec.id;
      if (selected.kind === "block" && sec.blocks.some((b) => b.id === selected.id)) return sec.id;
    }
    return undefined;
  })();

  const back = () => {
    if (screen === "sections" || screen === "preview") setScreen("pages");
    else navigate("/sites");
  };

  const tab = (
    id: MobileScreen | "check" | "more",
    label: string,
    icon: ReactNode,
    badge?: number,
  ) => {
    const active =
      id === "check"
        ? sheet?.kind === "panel" && sheet.panel === "check"
        : id === "more"
          ? sheet?.kind === "more"
          : screen === id && !sheet;
    return (
      <button
        type="button"
        className={cx("st-mob__tab", active && "is-active")}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (id === "check") setSheet({ kind: "panel", panel: "check" });
          else if (id === "more") setSheet({ kind: "more" });
          else {
            setSheet(null);
            setScreen(id);
          }
        }}
      >
        <span className="st-mob__tab-icon">
          {icon}
          {badge ? <span className="st-mob__tab-badge st-num">{badge}</span> : null}
        </span>
        <span className="st-mob__tab-label">{label}</span>
      </button>
    );
  };

  let sheetTitle = "";
  let sheetBody: ReactNode = null;
  if (sheet?.kind === "section") {
    const d = s().doc;
    const page = d.pages[s().pageId as keyof SiteDocument["pages"]];
    const i = page?.sections.findIndex((x) => x.id === sheet.section) ?? -1;
    const sec = sheet.section === d.site.footer.id ? d.site.footer : page?.sections[i];
    sheetTitle = sec ? sectionLabel(d, sec, i) : "Section";
    sheetBody = (
      <SectionSheetBody
        site={site}
        sectionId={sheet.section}
        blockId={sheet.block}
        onBlock={(block) =>
          setSheet({ kind: "section", section: sheet.section, ...(block ? { block } : {}) })
        }
        onClose={() => setSheet(null)}
      />
    );
  } else if (sheet?.kind === "panel") {
    sheetTitle = PANEL_TITLE[sheet.panel] ?? "";
    sheetBody =
      sheet.panel === "check" ? (
        <DesignCheckPanel onJump={jump} />
      ) : (
        <PanelBody panel={sheet.panel} />
      );
  } else if (sheet?.kind === "more") {
    sheetTitle = "More";
    sheetBody = (
      <ul className="st-mob__list" aria-label="More">
        {MORE.map((m) => (
          <li key={m.panel}>
            <button
              type="button"
              className="st-mob__row"
              onClick={() => setSheet({ kind: "panel", panel: m.panel })}
            >
              <span className="st-mob__row-icon">{m.icon}</span>
              <span className="st-mob__row-text">
                <span className="st-mob__row-title">{m.label}</span>
              </span>
              <ChevronRight aria-hidden="true" className="st-mob__chev" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="st-mob__row"
            disabled={!canRedo}
            onClick={() => s().redo()}
          >
            <span className="st-mob__row-icon">
              <Redo2 />
            </span>
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">Redo</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="st-mob__row"
            onClick={() => {
              setSheet(null);
              onHistory();
            }}
          >
            <span className="st-mob__row-icon">
              <History />
            </span>
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">History and versions</span>
            </span>
            <ChevronRight aria-hidden="true" className="st-mob__chev" />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="st-mob__row"
            onClick={() => navigate(`/sites/${site.id}/settings`)}
          >
            <span className="st-mob__row-icon">
              <Settings />
            </span>
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">Settings</span>
            </span>
            <ChevronRight aria-hidden="true" className="st-mob__chev" />
          </button>
        </li>
      </ul>
    );
  }

  return (
    <div className="st-mob" data-screen={screen} data-testid="mobile-studio">
      <header className="st-mob__top">
        <IconButton
          label={screen === "pages" ? "Back to your sites" : "All pages"}
          icon={<ArrowLeft />}
          tooltip={false}
          onClick={back}
        />
        <div className="st-mob__title">
          <span className="st-mob__site">{site.name}</span>
          <span className="st-mob__page">{screen === "pages" ? "Pages" : pageTitle}</span>
        </div>
        {!building && <SyncStatus />}
        <IconButton
          label="Undo"
          icon={<Undo2 />}
          tooltip={false}
          disabled={!canUndo}
          onClick={() => s().undo()}
        />
        {building ? (
          <Button variant="primary" size="sm" disabled>
            Publish
          </Button>
        ) : (
          <PublishButton />
        )}
      </header>
      <div className="st-mob__banners">
        <PublishPill />
        <SyncBanners />
        <UpdateBanner site={site} />
      </div>
      <main className="st-mob__main">
        {building ? (
          <div className="st-mob__screen st-mob__state">
            <Spinner size={16} />
            <p>Your site is still being set up. It opens here in a moment.</p>
          </div>
        ) : screen === "pages" ? (
          <PageList
            onOpen={(id) => {
              s().setPage(id);
              setScreen("sections");
            }}
          />
        ) : screen === "sections" ? (
          <SectionList onOpen={(id) => openSection(id)} />
        ) : (
          <div className="st-mob__preview">
            <Canvas
              siteName={site.name}
              onFrameDocument={(d) => {
                onFrameDocument(d);
                useCanvasDocument.setState({ doc: d });
              }}
            />
            {selectedSection && !sheet && (
              <div className="st-mob__editbar">
                <Button
                  variant="primary"
                  icon={<Pencil />}
                  onClick={() =>
                    openSection(
                      selectedSection,
                      selected?.kind === "block" ? selected.id : undefined,
                    )
                  }
                >
                  Edit {selected?.kind === "block" ? "this block" : "this section"}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
      <nav className="st-mob__tabs" aria-label="Studio">
        {tab("pages", "Pages", <FileText aria-hidden="true" />)}
        {tab("sections", "Sections", <Rows3 aria-hidden="true" />)}
        {tab("preview", "Preview", <Eye aria-hidden="true" />)}
        {tab("check", "Check", <SearchCheck aria-hidden="true" />, attention)}
        {tab("more", "More", <Ellipsis aria-hidden="true" />)}
      </nav>
      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (open) return;
          setSheet(null);
          if (requested) useEditorUi.setState({ leftPanel: null });
        }}
        title={sheetTitle}
        className="st-mob__sheet"
      >
        {sheetBody}
      </Sheet>
      {trying && (
        <Suspense fallback={null}>
          <LookStage narrow />
        </Suspense>
      )}
    </div>
  );
}
