import {
  Bot,
  Cloud,
  Code2,
  Download,
  FilePlus2,
  Globe,
  House,
  ImagePlus,
  PanelTop,
  Settings2,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Spinner, useRegisterCommands } from "../../ui";
import { useEditorUi } from "../editor/editor-store";
import { useDocStoreApi } from "../editor/model/context";
import { MediaDetailsDialog, MediaPickerDialog } from "../media/MediaDetails";
import { useMediaSources } from "../media/sources";
import { useUploader } from "../media/useUploader";
import { AddPageDialog } from "../pages/AddPageDialog";
import { PageSettingsDialog } from "../pages/PageSettingsDialog";
import { can, useManageUi } from "./manage-ui";

const SettingsView = lazy(() =>
  import("../settings/SettingsView").then((m) => ({ default: m.SettingsView })),
);

const SETTINGS_RE = /\/sites\/[^/]+\/settings(?:\/([a-z-]+))?\/?$/;

/** Which settings tab the URL asks for: undefined = settings closed, null = the tab list. */
export function settingsTabFromPath(pathname: string): string | null | undefined {
  const m = SETTINGS_RE.exec(pathname);
  if (!m) return undefined;
  return m[1] ?? null;
}

/**
 * Mounted once inside the editor: the site-management dialogs (page settings, add page, media
 * details/picker), the settings overlay (`/sites/:id/settings/:tab`), ⌘K commands, and the
 * upload queue resuming from an earlier session.
 */
export function SiteManagementHost({ site }: { site: Site }) {
  const navigate = useNavigate();
  const location = useLocation();
  const api = useDocStoreApi();
  const uploader = useUploader(site);
  const tab = settingsTabFromPath(location.pathname);
  const settings = (t?: string) => navigate(`/sites/${site.id}/settings${t ? `/${t}` : ""}`);

  // Library files show in Studio from the site's draft files.
  useEffect(() => {
    useMediaSources.getState().setRepo(site.repo || null);
  }, [site.repo]);

  // Finish uploads left in the queue by an earlier visit; pause them when the editor closes.
  useEffect(() => {
    void uploader?.resume();
    return () => {
      uploader?.dispose();
      useManageUi.getState().reset();
    };
  }, [uploader]);

  const openPanel = (panel: "pages" | "media" | "chrome") =>
    useEditorUi.getState().setLeftPanel(panel);

  useRegisterCommands("site-management", [
    {
      id: "add-page",
      label: "Add page…",
      group: "Pages",
      icon: <FilePlus2 />,
      run: () => useManageUi.getState().openAddPage({}),
    },
    {
      id: "page-settings",
      label: "Page settings…",
      group: "Pages",
      icon: <Settings2 />,
      run: () => useManageUi.getState().openPageSettings(api.getState().pageId),
    },
    {
      id: "edit-header",
      label: "Edit header",
      group: "Site",
      icon: <PanelTop />,
      run: () => openPanel("chrome"),
    },
    {
      id: "open-media",
      label: "Open media library",
      group: "Site",
      icon: <ImagePlus />,
      run: () => openPanel("media"),
    },
    {
      id: "settings",
      label: "Settings",
      group: "Settings",
      icon: <Settings2 />,
      run: () => settings("general"),
    },
    {
      id: "settings-home",
      label: "Where my site lives",
      group: "Settings",
      icon: <House />,
      run: () => settings("home"),
    },
    ...(can(site, "designer")
      ? [
          {
            id: "settings-domain",
            label: "Connect a domain",
            group: "Settings",
            icon: <Globe />,
            run: () => settings("domains"),
          },
        ]
      : []),
    {
      id: "settings-ai",
      label: "Connect your AI",
      group: "Settings",
      icon: <Bot />,
      run: () => settings("ai"),
    },
    {
      id: "settings-people",
      label: "Invite people",
      group: "Settings",
      icon: <Users />,
      run: () => settings("collaborators"),
    },
    ...(can(site, "owner")
      ? [
          {
            id: "settings-hosting",
            label: "Hosting",
            group: "Settings",
            icon: <Cloud />,
            run: () => settings("hosting"),
          },
          {
            id: "settings-export",
            label: "Export your data",
            group: "Settings",
            icon: <Download />,
            run: () => settings("export"),
          },
        ]
      : []),
    ...(can(site, "designer")
      ? [
          {
            id: "settings-advanced",
            label: "Custom CSS and code",
            group: "Settings",
            icon: <Code2 />,
            run: () => settings("advanced"),
          },
        ]
      : []),
  ]);

  return (
    <>
      <PageSettingsDialog />
      <AddPageDialog />
      <MediaDetailsDialog />
      <MediaPickerDialog />
      {tab !== undefined && (
        <Suspense
          fallback={
            <div className="st-settings-loading">
              <Spinner size={16} label="Opening settings" />
            </div>
          }
        >
          <SettingsView site={site} tab={(tab as never) ?? null} />
        </Suspense>
      )}
    </>
  );
}
