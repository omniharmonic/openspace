import type { SiteDocument } from "@omniharmonic/openspace-schema";
import {
  ArrowLeft,
  ChevronRight,
  Ellipsis,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Inbox,
  Newspaper,
  Palette,
  PanelTop,
  Pencil,
  Redo2,
  Rows3,
  SearchCheck,
  Settings,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Button, cx, IconButton, Sheet, Spinner } from "../../ui";
import { useAddSection } from "../add-section/blockMenuStore";
import { DesignCheckPanel } from "../design-check/DesignCheckPanel";
import type { CheckedIssue } from "../design-check/model";
import { useDesignCheck } from "../design-check/store";
import { Canvas } from "../editor/canvas/Canvas";
import { type LeftPanel, useEditorUi } from "../editor/editor-store";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { sectionLabel } from "../editor/model/selection";
import { SettingUp } from "../editor/SettingUp";
import { useCanvasDocument } from "../inspector/canvasDoc";
import { useLookTrial } from "../looks/trial";
import { MediaLibrary } from "../media/MediaLibrary";
import { PagesManager } from "../pages/PagesManager";
import { SiteChromePanel } from "../site-chrome/SiteChromePanel";
import { PublishButton, PublishPill } from "../sync/PublishFlow";
import { SyncBanners, SyncStatus } from "../sync/SyncChrome";
import { UpdateBanner } from "../updates/UpdateBanner";
import { workspacePath } from "../workspace/routes";
import "./mobile.css";

import { PageList } from "./PageList";
import { SectionList } from "./SectionList";
import { SectionSheetBody } from "./SectionSheet";

export { pagesInOrder, sectionSummary } from "./helpers";

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
  const checkFailed = useDesignCheck((s) => s.failures.length > 0);
  const trying = useLookTrial((s) => s.templateId !== null);
  const requested = useEditorUi((s) => s.leftPanel);
  const [screen, setScreen] = useState<MobileScreen>("sections");
  const [sheet, setSheet] = useState<SheetState>(null);
  // Panels opened from elsewhere (the publish dialog's "Review issues") open as sheets here.
  // The desktop's open panel (Pages by default) isn't a request: start clean. A separate
  // mount effect, declared first, so it also runs again when React StrictMode re-mounts (whose
  // cleanup of the editor resets the UI store back to the default "pages").
  useEffect(() => {
    useEditorUi.setState({ leftPanel: null });
  }, []);
  useEffect(() => {
    // Read the live value: a re-run can carry the stale default from the first render.
    if (!requested || useEditorUi.getState().leftPanel !== requested) return;
    // Panels asked for from elsewhere (⌘K, the publish dialog's "Review issues", shortcuts)
    // open the phone way; the request is consumed so asking again works.
    if (requested === "add") useAddSection.getState().openAt("end");
    else if (requested === "layers") {
      setSheet(null);
      setScreen("sections");
    } else if (PANEL_TITLE[requested]) setSheet({ kind: "panel", panel: requested });
    useEditorUi.setState({ leftPanel: null });
  }, [requested]);
  // Trying a look takes over the screen: close the gallery sheet behind it.
  const [wasTrying, setWasTrying] = useState(trying);
  if (trying !== wasTrying) {
    setWasTrying(trying);
    if (trying) setSheet(null);
  }
  const building = site.status === "building";
  const s = () => api.getState();

  const openSection = (section: string, block?: string) => {
    if (block) s().select({ kind: "block", id: block });
    else s().select({ kind: "section", id: section });
    setSheet({ kind: "section", section, ...(block ? { block } : {}) });
  };

  const jump = (issue: CheckedIssue) => {
    // Site-wide issues (colors, typefaces) live in Site Styles.
    if (!issue.page) {
      setSheet({ kind: "panel", panel: "styles" });
      return;
    }
    if (issue.page !== "footer") s().setPage(issue.page);
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
    badge?: number | string,
    badgeLabel?: string,
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
        aria-label={badgeLabel ? `${label}${badgeLabel}` : undefined}
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
          {badge ? (
            <span className="st-mob__tab-badge st-num" aria-hidden={badgeLabel ? true : undefined}>
              {badge}
            </span>
          ) : null}
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
            onClick={() => {
              setSheet(null);
              navigate(workspacePath(site.id, "content"));
            }}
          >
            <span className="st-mob__row-icon">
              <Newspaper />
            </span>
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">Blog, events and store</span>
            </span>
            <ChevronRight aria-hidden="true" className="st-mob__chev" />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="st-mob__row"
            onClick={() => {
              setSheet(null);
              navigate(workspacePath(site.id, "inbox"));
            }}
          >
            <span className="st-mob__row-icon">
              <Inbox />
            </span>
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">Form inbox</span>
            </span>
            <ChevronRight aria-hidden="true" className="st-mob__chev" />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="st-mob__row"
            onClick={() => {
              // Close More first, as every other row does, so Settings isn't stuck behind it.
              setSheet(null);
              navigate(`/sites/${site.id}/settings`);
            }}
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
            <SettingUp site={site} />
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
        {tab(
          "check",
          "Check",
          <SearchCheck aria-hidden="true" />,
          attention || (checkFailed ? "!" : undefined),
          checkFailed
            ? `: couldn’t check everything${attention ? `, ${attention} issues` : ""}`
            : attention
              ? `: ${attention} ${attention === 1 ? "issue" : "issues"}`
              : undefined,
        )}
        {tab("more", "More", <Ellipsis aria-hidden="true" />)}
      </nav>
      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (open) return;
          setSheet(null);
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
