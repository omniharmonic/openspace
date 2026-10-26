import type { SiteDocument } from "@openspace/schema";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Copy,
  CopyPlus,
  CornerLeftUp,
  Eye,
  FileText,
  Image,
  Keyboard,
  Layers,
  LayoutGrid,
  ListChecks,
  Monitor,
  Palette,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Trash,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { useSession, useSite, useSiteDocument } from "../../api";
import type { Site } from "../../api/types";
import { useConfig } from "../../app/config";
import { Mark } from "../../app/Wordmark";
import {
  AvatarStack,
  Badge,
  Button,
  cx,
  EmptyState,
  IconButton,
  Kbd,
  Menu,
  Segmented,
  Sheet,
  Skeleton,
  Spinner,
  Tooltip,
  toast,
  useCommandStore,
  useRegisterCommands,
} from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { Canvas } from "./canvas/Canvas";
import "./canvas/canvas.css";
import {
  type Breakpoint,
  DEVICE_WIDTHS,
  effectiveZoom,
  type LeftPanel,
  useEditorUi,
} from "./editor-store";
import "./EditorFrame.css";
import { FirstRunChecklist, useChecklist } from "./FirstRunChecklist";
import {
  type ClipPayload,
  copyItems,
  deleteItems,
  duplicateItems,
  insertSection,
  parseClip,
  pasteItems,
} from "./model/actions";
import { EditorStoreProvider, useDocStore, useDocStoreApi } from "./model/context";
import { placeholderDocument } from "./model/dev-site";
import { locate, parentOf } from "./model/selection";
import { STARTERS } from "./model/starters";
import { createEditorStore, type EditorStore } from "./model/store";
import { Inspector } from "./panels/Inspector";
import { LayersPanel } from "./panels/LayersPanel";
import { PagesPanel } from "./panels/PagesPanel";
import { ShortcutsSheet } from "./panels/ShortcutsSheet";
import { handleEditorKey, isTypingTarget, type ShortcutEnv } from "./shortcuts";

const PANELS: Array<{ id: LeftPanel; label: string; icon: ReactNode; shortcut: string }> = [
  { id: "pages", label: "Pages", icon: <FileText />, shortcut: "alt+1" },
  { id: "layers", label: "Layers", icon: <Layers />, shortcut: "alt+2" },
  { id: "add", label: "Add section", icon: <Plus />, shortcut: "alt+3" },
  { id: "styles", label: "Site styles", icon: <Palette />, shortcut: "alt+4" },
  { id: "media", label: "Media", icon: <Image />, shortcut: "alt+5" },
];

const DEVICE_LABEL: Record<Breakpoint, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Phone",
};

function useIsNarrow(query = "(max-width: 767px)") {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches),
  );
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast({ tone: "success", title: "Link copied", description: displayUrl(url) });
  } catch {
    toast({ tone: "danger", title: "Couldn’t copy the link", description: url });
  }
}

/** Placeholder list while the site's content loads (Task 20 wires the real document). */
function PanelSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="st-ed-panel__skeleton" role="status" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
        <div key={i} className="st-ed-panel__skeleton-row">
          <Skeleton width={14} height={14} radius={3} />
          <Skeleton width={`${50 + ((i * 17) % 40)}%`} height={10} />
        </div>
      ))}
    </div>
  );
}

function AddSectionPanel() {
  const api = useDocStoreApi();
  return (
    <ul className="st-ed-starters" aria-label="Section starters">
      {STARTERS.map((st) => (
        <li key={st.id}>
          <button
            type="button"
            onClick={() => {
              const s = api.getState();
              const sel = s.selection.at(-1);
              const loc = sel ? locate(s.doc, s.pageId, sel) : undefined;
              const at =
                loc && loc.container !== "footer" ? { after: loc.section.id } : ("end" as const);
              s.run(insertSection(s.pageId, st.build(), at));
            }}
          >
            <strong>{st.label}</strong>
            <span>{st.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LeftPanelBody({ panel }: { panel: LeftPanel }) {
  if (panel === "pages") return <PagesPanel />;
  if (panel === "layers") return <LayersPanel />;
  if (panel === "add") return <AddSectionPanel />;
  const label = PANELS.find((p) => p.id === panel)?.label ?? "";
  return <PanelSkeleton label={`Loading ${label.toLowerCase()}`} rows={6} />;
}

function ZoomMenu() {
  const zoom = useEditorUi((s) => s.zoom);
  const fitScale = useEditorUi((s) => s.fitScale);
  const { setZoom, zoomIn, zoomOut } = useEditorUi.getState();
  const pct = Math.round(effectiveZoom({ zoom, fitScale }) * 100);
  return (
    <Menu
      align="end"
      label="Zoom"
      trigger={
        <button type="button" className="st-ed-zoom" aria-label={`Zoom ${pct}%`}>
          <span className="st-num">{pct}%</span>
          <ChevronDown aria-hidden="true" />
        </button>
      }
      items={[
        { label: "Zoom in", shortcut: "mod+=", onSelect: zoomIn },
        { label: "Zoom out", shortcut: "mod+-", onSelect: zoomOut },
        { type: "separator" },
        { label: "Zoom to fit", shortcut: "shift+1", onSelect: () => setZoom("fit") },
        { label: "Zoom to 50%", onSelect: () => setZoom(0.5) },
        { label: "Zoom to 100%", shortcut: "mod+0", onSelect: () => setZoom(1) },
        { label: "Zoom to 200%", onSelect: () => setZoom(2) },
      ]}
    />
  );
}

function WelcomeToast({ site }: { site: Site }) {
  const [params, setParams] = useSearchParams();
  const shown = useRef(false);
  useEffect(() => {
    if (params.get("welcome") !== "1" || site.status !== "live" || shown.current) return;
    shown.current = true;
    toast({
      id: `welcome-${site.id}`,
      tone: "celebrate",
      title: "Your site is live",
      description: (
        <a href={site.url} target="_blank" rel="noreferrer">
          {displayUrl(site.url)}
        </a>
      ),
      duration: 12_000,
      action: { label: "Copy link", keepOpen: true, onClick: () => void copyLink(site.url) },
    });
    const next = new URLSearchParams(params);
    next.delete("welcome");
    setParams(next, { replace: true });
  }, [params, setParams, site]);
  return null;
}

/** In-memory clipboard, used when the system clipboard is unavailable (and across pages). */
let memoryClip: ClipPayload | null = null;

/**
 * Binds editor shortcuts and copy/paste on the Studio window and on the canvas document
 * (keystrokes inside the iframe never reach the Studio window).
 */
function useEditorInput(env: ShortcutEnv, frameDoc: Document | null) {
  const envRef = useRef(env);
  envRef.current = env;
  useEffect(() => {
    const targets: Array<Window | Document> = [window];
    const frameWin = frameDoc?.defaultView;
    if (frameWin && frameWin !== window) targets.push(frameWin);
    const docs: Document[] = [document];
    if (frameDoc && frameDoc !== document) docs.push(frameDoc);
    const onKeyDown = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (
        ke.key === " " &&
        !ke.repeat &&
        !isTypingTarget(ke.target) &&
        !envRef.current.store.getState().editing
      ) {
        const t = ke.target as Element | null;
        const onButton = t && "tagName" in t && /^(BUTTON|A|SUMMARY)$/.test(String(t.tagName));
        if (!onButton) {
          ke.preventDefault();
          useEditorUi.getState().setPanning(true);
          return;
        }
      }
      if (useEditorUi.getState().shortcutsOpen && ke.key !== "?") return;
      handleEditorKey(envRef.current, ke);
    };
    const onKeyUp = (e: Event) => {
      if ((e as KeyboardEvent).key === " ") useEditorUi.getState().setPanning(false);
    };
    const onBlur = () => useEditorUi.getState().setPanning(false);
    const blocked = (e: Event) => {
      const s = envRef.current.store.getState();
      return s.editing !== null || isTypingTarget(e.target) || !s.selection.length;
    };
    const onCopy = (e: Event, cut = false) => {
      if (blocked(e)) return;
      const s = envRef.current.store.getState();
      const clip = copyItems(s.doc, s.pageId, s.selection);
      if (!clip) return;
      memoryClip = clip;
      const ce = e as ClipboardEvent;
      ce.clipboardData?.setData("text/plain", JSON.stringify(clip));
      e.preventDefault();
      if (cut) s.run(deleteItems(s.doc, s.pageId, s.selection));
      toast({ title: cut ? "Cut" : "Copied", description: "Paste on any page with ⌘V." });
    };
    const onCut = (e: Event) => onCopy(e, true);
    const onPaste = (e: Event) => {
      const s = envRef.current.store.getState();
      if (s.editing !== null || isTypingTarget(e.target)) return;
      const ce = e as ClipboardEvent;
      const text = ce.clipboardData?.getData("text/plain");
      const clip = parseClip(text) ?? (text ? null : memoryClip);
      if (!clip) return;
      e.preventDefault();
      s.run(pasteItems(s.doc, s.pageId, s.selection, clip));
    };
    for (const t of targets) {
      t.addEventListener("keydown", onKeyDown);
      t.addEventListener("keyup", onKeyUp);
      t.addEventListener("blur", onBlur);
    }
    for (const d of docs) {
      d.addEventListener("copy", onCopy);
      d.addEventListener("cut", onCut);
      d.addEventListener("paste", onPaste);
    }
    return () => {
      for (const t of targets) {
        t.removeEventListener("keydown", onKeyDown);
        t.removeEventListener("keyup", onKeyUp);
        t.removeEventListener("blur", onBlur);
      }
      for (const d of docs) {
        d.removeEventListener("copy", onCopy);
        d.removeEventListener("cut", onCut);
        d.removeEventListener("paste", onPaste);
      }
    };
  }, [frameDoc]);
}

function EditorChrome({ site }: { site: Site }) {
  const navigate = useNavigate();
  const session = useSession();
  const ui = useEditorUi();
  const narrow = useIsNarrow();
  const checklist = useChecklist(site.id);
  const [sheet, setSheet] = useState<LeftPanel | "inspector" | null>(null);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  const store = useDocStoreApi();
  const pageTitle = useDocStore(
    (s) => s.doc.pages[s.pageId as keyof SiteDocument["pages"]]?.title ?? "",
  );
  const pages = useDocStore((s) => s.doc.pages);
  const canUndo = useDocStore((s) => s.undoStack.length > 0);
  const canRedo = useDocStore((s) => s.redoStack.length > 0);
  const hasSelection = useDocStore((s) => s.selection.length > 0);
  const user = session.data?.user;
  const live = site.status === "live";

  useEffect(() => {
    document.documentElement.dataset.toastAnchor = "canvas";
    return () => {
      delete document.documentElement.dataset.toastAnchor;
      useEditorUi.getState().reset();
    };
  }, []);

  // Phones edit the phone layout by default.
  useEffect(() => {
    if (narrow) useEditorUi.getState().setBreakpoint("mobile");
  }, [narrow]);

  // The first-run checklist ticks itself when the home page's opening words or photo change.
  const complete = checklist.complete;
  useEffect(
    () =>
      store.getState().onLocalOps((ops) => {
        const s = store.getState();
        const home = Object.values(s.doc.pages).find((p) => p.slug === "");
        const first = home?.sections[0];
        for (const op of ops) {
          if (op.op !== "block.update" || !first) continue;
          const block = first.blocks.find((b) => b.id === op.block);
          if (block?.type === "text") complete("headline");
          if (block?.type === "image") complete("photo");
        }
      }),
    [store, complete],
  );

  const openPanel = (id: LeftPanel) => (narrow ? setSheet(id) : ui.toggleLeftPanel(id));

  useEditorInput(
    {
      store,
      zoomIn: ui.zoomIn,
      zoomOut: ui.zoomOut,
      zoomTo: (z) => ui.setZoom(z),
      togglePalette: () => useCommandStore.getState().toggle(),
      toggleShortcutsSheet: () => ui.setShortcutsOpen(!useEditorUi.getState().shortcutsOpen),
      toggleChrome: ui.toggleChrome,
      openPanel: (i) => {
        const p = PANELS[i];
        if (p) openPanel(p.id);
      },
    },
    frameDoc,
  );

  const s = () => store.getState();
  useRegisterCommands("editor-edit", [
    {
      id: "undo",
      label: "Undo",
      group: "Edit",
      icon: <Undo2 />,
      shortcut: "mod+z",
      run: () => s().undo(),
    },
    {
      id: "redo",
      label: "Redo",
      group: "Edit",
      icon: <Redo2 />,
      shortcut: "shift+mod+z",
      run: () => s().redo(),
    },
    ...(hasSelection
      ? [
          {
            id: "duplicate",
            label: "Duplicate selection",
            group: "Edit",
            icon: <CopyPlus />,
            shortcut: "mod+d",
            run: () => s().run(duplicateItems(s().doc, s().pageId, s().selection)),
          },
          {
            id: "delete",
            label: "Delete selection",
            group: "Edit",
            icon: <Trash />,
            shortcut: "backspace",
            run: () => s().run(deleteItems(s().doc, s().pageId, s().selection)),
          },
          {
            id: "select-parent",
            label: "Select parent",
            group: "Edit",
            icon: <CornerLeftUp />,
            shortcut: "escape",
            run: () => {
              const item = s().selection.at(-1);
              if (item) s().select(parentOf(s().doc, s().pageId, item) ?? null);
            },
          },
        ]
      : []),
    ...STARTERS.map((st) => ({
      id: `add-${st.id}`,
      label: `Add section: ${st.label}`,
      group: "Add",
      icon: <Plus />,
      run: () => s().run(insertSection(s().pageId, st.build(), "end")),
    })),
    ...Object.values(pages).map((p) => ({
      id: `page-${p.id}`,
      label: `Go to ${p.title}`,
      group: "Pages",
      icon: <FileText />,
      keywords: [p.slug],
      run: () => s().setPage(p.id),
    })),
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      group: "Help",
      icon: <Keyboard />,
      shortcut: "?",
      run: () => ui.setShortcutsOpen(true),
    },
  ]);

  useRegisterCommands("editor", [
    ...(["desktop", "tablet", "mobile"] as const).map((bp) => ({
      id: `device-${bp}`,
      label: `Preview on ${DEVICE_LABEL[bp].toLowerCase()}`,
      group: "View",
      icon: bp === "desktop" ? <Monitor /> : bp === "tablet" ? <Tablet /> : <Smartphone />,
      run: () => ui.setBreakpoint(bp),
    })),
    {
      id: "zoom-fit",
      label: "Zoom to fit",
      group: "View",
      icon: <ZoomIn />,
      shortcut: "shift+1",
      run: () => ui.setZoom("fit"),
    },
    {
      id: "zoom-100",
      label: "Zoom to 100%",
      group: "View",
      icon: <ZoomIn />,
      shortcut: "mod+0",
      run: () => ui.setZoom(1),
    },
    {
      id: "toggle-chrome",
      label: ui.chromeHidden ? "Show panels" : "Hide panels",
      group: "View",
      icon: <PanelLeft />,
      shortcut: "mod+backslash",
      run: ui.toggleChrome,
    },
    ...PANELS.map((p) => ({
      id: `panel-${p.id}`,
      label: `Open ${p.label.toLowerCase()}`,
      group: "Panels",
      icon: p.icon,
      shortcut: p.shortcut,
      run: () => openPanel(p.id),
    })),
    {
      id: "copy-link",
      label: "Copy live link",
      group: "Site",
      icon: <Copy />,
      run: () => void copyLink(site.url),
    },
    {
      id: "view-live",
      label: "View live site",
      group: "Site",
      icon: <ArrowUpRight />,
      run: () => window.open(site.url, "_blank", "noopener"),
    },
    {
      id: "show-checklist",
      label: "Show setup checklist",
      group: "Site",
      icon: <ListChecks />,
      run: checklist.show,
    },
    {
      id: "back",
      label: "Back to your sites",
      group: "Site",
      icon: <LayoutGrid />,
      run: () => navigate("/sites"),
    },
  ]);

  const showLeft = !narrow && !ui.chromeHidden && ui.leftPanel;
  const showRight = !narrow && !ui.chromeHidden && ui.inspectorOpen;
  const leftMeta = PANELS.find((p) => p.id === ui.leftPanel);

  return (
    <div
      className={cx("st-editor", ui.chromeHidden && "st-editor--bare")}
      data-left={showLeft ? "open" : "closed"}
      data-right={showRight ? "open" : "closed"}
    >
      <WelcomeToast site={site} />
      <header className="st-ed-top">
        <div className="st-ed-top__left">
          <Tooltip content="Back to your sites">
            <button
              type="button"
              className="st-ed-home"
              aria-label="Back to your sites"
              onClick={() => navigate("/sites")}
            >
              <Mark size={16} />
              <ArrowLeft className="st-ed-home__back" aria-hidden="true" />
            </button>
          </Tooltip>
          <Menu
            label="Site"
            trigger={
              <button type="button" className="st-ed-site">
                <span className="st-ed-site__name">{site.name}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            }
            items={[
              {
                label: "View live site",
                icon: <ArrowUpRight />,
                disabled: !live,
                onSelect: () => window.open(site.url, "_blank", "noopener"),
              },
              { label: "Copy live link", icon: <Copy />, onSelect: () => void copyLink(site.url) },
              { label: "Show setup checklist", icon: <ListChecks />, onSelect: checklist.show },
              { type: "separator" },
              { label: "Your sites", icon: <LayoutGrid />, onSelect: () => navigate("/sites") },
            ]}
          />
          <span className="st-ed-top__sep" aria-hidden="true" />
          <span className="st-ed-page">{pageTitle}</span>
        </div>

        <div className="st-ed-top__center">
          <Segmented<Breakpoint>
            aria-label="Device preview"
            size="sm"
            value={ui.breakpoint}
            onValueChange={ui.setBreakpoint}
            options={(["desktop", "tablet", "mobile"] as const).map((bp) => ({
              value: bp,
              ariaLabel: `${DEVICE_LABEL[bp]} (${DEVICE_WIDTHS[bp]})`,
              label: bp === "desktop" ? <Monitor /> : bp === "tablet" ? <Tablet /> : <Smartphone />,
            }))}
          />
          <ZoomMenu />
        </div>

        <div className="st-ed-top__right">
          {user && (
            <AvatarStack
              people={[{ id: user.id, name: user.name, avatarUrl: user.avatarUrl }]}
              label="Editing now"
              size={22}
            />
          )}
          {live ? (
            <Badge tone="live" dot title={site.url}>
              Live
            </Badge>
          ) : site.status === "building" ? (
            <Badge tone="pending" dot pulse>
              Setting up
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Needs attention
            </Badge>
          )}
          <span className="st-ed-top__sep" aria-hidden="true" />
          <IconButton
            label="Undo"
            icon={<Undo2 />}
            shortcut="mod+z"
            disabled={!canUndo}
            onClick={() => s().undo()}
            className="st-ed-hide-narrow"
          />
          <IconButton
            label="Redo"
            icon={<Redo2 />}
            shortcut="shift+mod+z"
            disabled={!canRedo}
            onClick={() => s().redo()}
            className="st-ed-hide-narrow"
          />
          <IconButton
            label={ui.inspectorOpen ? "Hide inspector" : "Show inspector"}
            icon={<PanelRight />}
            active={showRight ? true : undefined}
            onClick={() => (narrow ? setSheet("inspector") : ui.toggleInspector())}
          />
          <Tooltip content="Open the live site in a new tab">
            <Button
              variant="ghost"
              size="sm"
              icon={<Eye />}
              disabled={!live}
              focusableWhenDisabled
              onClick={() => window.open(site.url, "_blank", "noopener")}
            >
              <span className="st-ed-hide-narrow">Preview</span>
            </Button>
          </Tooltip>
          <Tooltip content="No changes to publish yet">
            <Button variant="primary" size="sm" disabled focusableWhenDisabled>
              Publish
            </Button>
          </Tooltip>
        </div>
      </header>

      <nav className="st-ed-rail" aria-label="Panels">
        {PANELS.map((p) => (
          <IconButton
            key={p.id}
            label={p.label}
            icon={p.icon}
            shortcut={p.shortcut}
            tooltipSide="right"
            active={narrow ? sheet === p.id : showLeft ? ui.leftPanel === p.id : false}
            onClick={() => openPanel(p.id)}
          />
        ))}
        <span className="st-ed-rail__spacer" />
        <IconButton
          label={ui.chromeHidden ? "Show panels" : "Hide panels"}
          icon={<PanelLeft />}
          shortcut="mod+backslash"
          tooltipSide="right"
          className="st-ed-hide-narrow"
          onClick={ui.toggleChrome}
        />
      </nav>

      {showLeft && leftMeta && (
        <aside className="st-ed-panel st-ed-panel--left" aria-label={leftMeta.label}>
          <div className="st-ed-panel__head">
            <h2 className="st-ed-panel__title">{leftMeta.label}</h2>
            <Kbd shortcut={leftMeta.shortcut} />
          </div>
          <LeftPanelBody panel={leftMeta.id} />
        </aside>
      )}

      <main className="st-ed-main">
        {site.status === "building" ? (
          <section className="st-ed-canvas" aria-label="Canvas">
            <div className="st-ed-canvas__state">
              <Spinner size={16} />
              <p>Your site is still being set up. It opens here in a moment.</p>
            </div>
          </section>
        ) : (
          <Canvas siteName={site.name} onFrameDocument={setFrameDoc} />
        )}
        <div className="st-ed-main__overlay">
          <FirstRunChecklist checklist={checklist} />
        </div>
      </main>

      {showRight && (
        <aside className="st-ed-panel st-ed-panel--right" aria-label="Inspector">
          <Inspector />
        </aside>
      )}

      <Sheet
        open={narrow && sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        title={
          sheet === "inspector" ? "Inspector" : (PANELS.find((p) => p.id === sheet)?.label ?? "")
        }
      >
        {sheet === "inspector" ? <Inspector /> : sheet ? <LeftPanelBody panel={sheet} /> : null}
      </Sheet>
      <ShortcutsSheet />
    </div>
  );
}

const PENDING_DOC = placeholderDocument();

/** Holds the per-site document store once the content has loaded. */
function EditorSession({
  site,
  document: content,
  actor,
}: {
  site: Site;
  document: SiteDocument;
  actor: string;
}) {
  const store = useMemo<EditorStore>(
    () => createEditorStore({ doc: content, actor }),
    [content, actor],
  );
  return (
    <EditorStoreProvider store={store}>
      <EditorChrome site={site} />
    </EditorStoreProvider>
  );
}

/** `/sites/:id/*` — the editor. */
export function EditorFrame() {
  const { id } = useParams();
  const session = useSession();
  const { timing } = useConfig();
  const user = session.data?.user;
  const site = useSite(user ? id : undefined, { pollMs: timing.pollMs });
  const content = useSiteDocument(site.data?.id, { enabled: site.data?.status !== "building" });
  const navigate = useNavigate();

  const loading =
    session.isPending ||
    (user && site.isPending) ||
    (site.data && site.data.status !== "building" && content.isPending);
  if (loading) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Opening the editor" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`/sites/${id}`)}`} replace />;
  if (site.isError || !site.data || content.isError) {
    return (
      <div className="st-center">
        <EmptyState
          title="This site can’t be opened"
          description={
            site.error?.message ??
            content.error?.message ??
            "It may have been deleted or moved to another account."
          }
          action={
            <Button variant="primary" onClick={() => navigate("/sites")}>
              Back to your sites
            </Button>
          }
        />
      </div>
    );
  }
  const doc = content.data?.document ?? PENDING_DOC;
  return (
    <EditorSession
      // Per-site state (store, checklist, welcome toast, sheets) starts fresh when the site changes.
      key={site.data.id}
      site={site.data}
      document={doc}
      actor={`user:${user.id}`}
    />
  );
}
