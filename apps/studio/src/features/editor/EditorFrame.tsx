import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Image,
  LayoutGrid,
  Layers,
  ListChecks,
  Monitor,
  MousePointer2,
  Palette,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { useSession, useSite, useTemplates } from "../../api";
import type { Site, TemplateSummary } from "../../api/types";
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
  Tabs,
  Tooltip,
  toast,
  useRegisterCommands,
  useShortcuts,
} from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { SiteSketch } from "../templates/SiteSketch";
import {
  type Breakpoint,
  DEVICE_HEIGHTS,
  DEVICE_WIDTHS,
  effectiveZoom,
  type LeftPanel,
  useEditorUi,
} from "./editor-store";
import "./EditorFrame.css";
import { FirstRunChecklist, useChecklist } from "./FirstRunChecklist";

const PANELS: Array<{ id: LeftPanel; label: string; icon: ReactNode; shortcut: string }> = [
  { id: "pages", label: "Pages", icon: <FileText />, shortcut: "alt+1" },
  { id: "layers", label: "Layers", icon: <Layers />, shortcut: "alt+2" },
  { id: "add", label: "Add section", icon: <Plus />, shortcut: "alt+3" },
  { id: "styles", label: "Site styles", icon: <Palette />, shortcut: "alt+4" },
  { id: "media", label: "Media", icon: <Image />, shortcut: "alt+5" },
];

const DEVICE_LABEL: Record<Breakpoint, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Phone" };

function useIsNarrow(query = "(max-width: 767px)") {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
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
    <div className="st-ed-panel__skeleton" aria-busy="true" aria-label={label}>
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

function LeftPanelBody({ panel }: { panel: LeftPanel }) {
  const label = PANELS.find((p) => p.id === panel)?.label ?? "";
  return <PanelSkeleton label={`Loading ${label.toLowerCase()}`} rows={panel === "add" || panel === "media" ? 6 : 4} />;
}

function Inspector() {
  return (
    <Tabs
      aria-label="Inspector"
      items={[
        {
          value: "design",
          label: "Design",
          content: (
            <EmptyState
              size="sm"
              icon={<MousePointer2 />}
              title="Nothing selected"
              description="Click anything on the page to change its words, images or style."
            />
          ),
        },
        {
          value: "page",
          label: "Page",
          content: <PanelSkeleton label="Loading page settings" rows={3} />,
        },
      ]}
    />
  );
}

function Canvas({ site, template }: { site: Site; template: TemplateSummary | undefined }) {
  const breakpoint = useEditorUi((s) => s.breakpoint);
  const zoom = useEditorUi((s) => s.zoom);
  const fitScale = useEditorUi((s) => s.fitScale);
  const setFitScale = useEditorUi((s) => s.setFitScale);
  const ref = useRef<HTMLDivElement>(null);
  const device = DEVICE_WIDTHS[breakpoint];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth - (el.clientWidth < 768 ? 24 : 96);
      if (avail > 0) setFitScale(Math.min(1, avail / device));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device, setFitScale]);

  const scale = zoom === "fit" ? fitScale : zoom;
  const look = template?.looks.find((l) => l.id === site.look) ?? template?.looks[0];

  return (
    <div ref={ref} className="st-ed-canvas" aria-label="Canvas">
      <div
        className={cx("st-ed-canvas__frame", `st-ed-canvas__frame--${breakpoint}`)}
        style={{ width: Math.round(device * scale), height: Math.round(DEVICE_HEIGHTS[breakpoint] * scale) }}
      >
        <span className="st-ed-canvas__label">
          {site.name} <span className="st-num">{device}</span>
        </span>
        {site.status === "building" ? (
          <div className="st-ed-canvas__state">
            <Spinner size={16} />
            <p>Your site is still being set up. It opens here in a moment.</p>
          </div>
        ) : look ? (
          <SiteSketch variant="page" styles={look.styles} name={site.name} tagline={site.tagline} />
        ) : (
          <PanelSkeleton label="Loading page" rows={8} />
        )}
      </div>
    </div>
  );
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

function EditorChrome({ site, template }: { site: Site; template: TemplateSummary | undefined }) {
  const navigate = useNavigate();
  const session = useSession();
  const ui = useEditorUi();
  const narrow = useIsNarrow();
  const checklist = useChecklist(site.id);
  const [sheet, setSheet] = useState<LeftPanel | "inspector" | null>(null);
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

  const openPanel = (id: LeftPanel) => (narrow ? setSheet(id) : ui.toggleLeftPanel(id));

  useShortcuts({
    "mod+backslash": ui.toggleChrome,
    "mod+=": ui.zoomIn,
    "mod+-": ui.zoomOut,
    "mod+0": () => ui.setZoom(1),
    "shift+1": () => ui.setZoom("fit"),
    ...Object.fromEntries(PANELS.map((p) => [p.shortcut, () => openPanel(p.id)])),
  });

  useRegisterCommands("editor", [
    ...(["desktop", "tablet", "mobile"] as const).map((bp) => ({
      id: `device-${bp}`,
      label: `Preview on ${DEVICE_LABEL[bp].toLowerCase()}`,
      group: "View",
      icon: bp === "desktop" ? <Monitor /> : bp === "tablet" ? <Tablet /> : <Smartphone />,
      run: () => ui.setBreakpoint(bp),
    })),
    { id: "zoom-fit", label: "Zoom to fit", group: "View", icon: <ZoomIn />, shortcut: "shift+1", run: () => ui.setZoom("fit") },
    { id: "zoom-100", label: "Zoom to 100%", group: "View", icon: <ZoomIn />, shortcut: "mod+0", run: () => ui.setZoom(1) },
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
    { id: "copy-link", label: "Copy live link", group: "Site", icon: <Copy />, run: () => void copyLink(site.url) },
    { id: "view-live", label: "View live site", group: "Site", icon: <ArrowUpRight />, run: () => window.open(site.url, "_blank", "noopener") },
    { id: "show-checklist", label: "Show setup checklist", group: "Site", icon: <ListChecks />, run: checklist.show },
    { id: "back", label: "Back to your sites", group: "Site", icon: <LayoutGrid />, run: () => navigate("/sites") },
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
            <button type="button" className="st-ed-home" aria-label="Back to your sites" onClick={() => navigate("/sites")}>
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
              { label: "View live site", icon: <ArrowUpRight />, disabled: !live, onSelect: () => window.open(site.url, "_blank", "noopener") },
              { label: "Copy live link", icon: <Copy />, onSelect: () => void copyLink(site.url) },
              { label: "Show setup checklist", icon: <ListChecks />, onSelect: checklist.show },
              { type: "separator" },
              { label: "Your sites", icon: <LayoutGrid />, onSelect: () => navigate("/sites") },
            ]}
          />
          <span className="st-ed-top__sep" aria-hidden="true" />
          <span className="st-ed-page">Home</span>
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
            <AvatarStack people={[{ id: user.id, name: user.name, avatarUrl: user.avatarUrl }]} label="Editing now" size={22} />
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
          <IconButton label="Undo" icon={<Undo2 />} shortcut="mod+z" disabled className="st-ed-hide-narrow" />
          <IconButton label="Redo" icon={<Redo2 />} shortcut="shift+mod+z" disabled className="st-ed-hide-narrow" />
          <IconButton
            label={ui.inspectorOpen ? "Hide inspector" : "Show inspector"}
            icon={<PanelRight />}
            active={showRight ? true : undefined}
            onClick={() => (narrow ? setSheet("inspector") : ui.toggleInspector())}
          />
          <Tooltip content="Open the live site in a new tab">
            <Button variant="ghost" size="sm" icon={<Eye />} disabled={!live} onClick={() => window.open(site.url, "_blank", "noopener")}>
              <span className="st-ed-hide-narrow">Preview</span>
            </Button>
          </Tooltip>
          <Tooltip content="No changes to publish yet">
            <span>
              <Button variant="primary" size="sm" disabled>
                Publish
              </Button>
            </span>
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
        <Canvas site={site} template={template} />
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
        title={sheet === "inspector" ? "Inspector" : (PANELS.find((p) => p.id === sheet)?.label ?? "")}
      >
        {sheet === "inspector" ? <Inspector /> : sheet ? <LeftPanelBody panel={sheet} /> : null}
      </Sheet>
    </div>
  );
}

/** `/sites/:id/*` — the editor frame. Task 20 fills the canvas and panels. */
export function EditorFrame() {
  const { id } = useParams();
  const session = useSession();
  const { timing } = useConfig();
  const site = useSite(session.data?.user ? id : undefined, { pollMs: timing.pollMs });
  const templates = useTemplates();
  const navigate = useNavigate();

  if (session.isPending || (session.data?.user && site.isPending)) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Opening the editor" />
      </div>
    );
  }
  if (!session.data?.user) return <Navigate to={`/signin?next=${encodeURIComponent(`/sites/${id}`)}`} replace />;
  if (site.isError || !site.data) {
    return (
      <div className="st-center">
        <EmptyState
          title="This site can’t be opened"
          description={site.error?.message ?? "It may have been deleted or moved to another account."}
          action={
            <Button variant="primary" onClick={() => navigate("/sites")}>
              Back to your sites
            </Button>
          }
        />
      </div>
    );
  }
  return <EditorChrome site={site.data} template={templates.data?.find((t) => t.id === site.data.template)} />;
}
