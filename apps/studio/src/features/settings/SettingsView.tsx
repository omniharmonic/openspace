import {
  ArrowLeft,
  Bot,
  Cloud,
  Code2,
  Download,
  Globe,
  House,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { cx, IconButton, Spinner } from "../../ui";
import { type Capability, can } from "../site-mgmt/manage-ui";
import { CollaboratorsSettings } from "./CollaboratorsSettings";
import { ConnectAiSettings } from "./ConnectAiSettings";
import { DeleteSiteSettings } from "./DeleteSiteSettings";
import { DomainsSettings } from "./DomainsSettings";
import { ExportSettings } from "./ExportSettings";
import { GeneralSettings } from "./GeneralSettings";
import { HomeExplainer } from "./HomeExplainer";
import { HostingSettings } from "./HostingSettings";
import "./settings.css";

// The code editors (CodeMirror) load only when Advanced opens.
const AdvancedSettings = lazy(() =>
  import("./AdvancedSettings").then((m) => ({ default: m.AdvancedSettings })),
);

export type SettingsTab =
  | "general"
  | "home"
  | "domains"
  | "ai"
  | "collaborators"
  | "hosting"
  | "advanced"
  | "export"
  | "delete";

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: ReactNode;
  /** Who sees it (default: everyone with access). */
  need?: Capability;
  render: (site: Site) => ReactNode;
}

export const SETTINGS_TABS: TabDef[] = [
  {
    id: "general",
    label: "General",
    icon: <Settings2 />,
    render: (s) => <GeneralSettings site={s} />,
  },
  {
    id: "home",
    label: "Your site's home",
    icon: <House />,
    render: (s) => <HomeExplainer site={s} />,
  },
  {
    id: "domains",
    label: "Domain",
    icon: <Globe />,
    need: "designer",
    render: (s) => <DomainsSettings site={s} />,
  },
  {
    id: "ai",
    label: "Connect your AI",
    icon: <Bot />,
    need: "editor",
    render: (s) => <ConnectAiSettings site={s} />,
  },
  {
    id: "collaborators",
    label: "People",
    icon: <Users />,
    render: (s) => <CollaboratorsSettings site={s} />,
  },
  {
    id: "hosting",
    label: "Hosting",
    icon: <Cloud />,
    need: "owner",
    render: (s) => <HostingSettings site={s} />,
  },
  {
    id: "advanced",
    label: "Advanced",
    icon: <Code2 />,
    need: "designer",
    render: (s) => (
      <Suspense fallback={<Spinner size={16} label="Loading" />}>
        <AdvancedSettings site={s} />
      </Suspense>
    ),
  },
  {
    id: "export",
    label: "Export",
    icon: <Download />,
    need: "owner",
    render: (s) => <ExportSettings site={s} />,
  },
  {
    id: "delete",
    label: "Delete site",
    icon: <Trash2 />,
    need: "owner",
    render: (s) => <DeleteSiteSettings site={s} />,
  },
];

export function visibleTabs(site: Site): TabDef[] {
  return SETTINGS_TABS.filter((t) => !t.need || can(site, t.need));
}

/**
 * Site settings, opened over the editor at `/sites/:id/settings/:tab`. On phones the tab list
 * is its own screen and each tab opens full width with a back button.
 */
export function SettingsView({ site, tab }: { site: Site; tab: SettingsTab | null }) {
  const navigate = useNavigate();
  const tabs = visibleTabs(site);
  const active = tabs.find((t) => t.id === tab) ?? null;
  const base = `/sites/${site.id}/settings`;
  const close = () => navigate(`/sites/${site.id}`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role='dialog']")) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section
      className={cx("st-settings", active ? "has-tab" : "no-tab")}
      aria-label="Site settings"
    >
      <nav className="st-settings__nav" aria-label="Settings">
        <div className="st-settings__navhead">
          <h1>Settings</h1>
          <IconButton label="Close settings" icon={<X />} size="sm" onClick={close} />
        </div>
        <ul>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={cx(
                  "st-settings__tab",
                  (active?.id ?? "general") === t.id && "is-active",
                  t.id === "delete" && "is-danger",
                )}
                aria-current={active?.id === t.id ? "page" : undefined}
                onClick={() => navigate(`${base}/${t.id}`)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="st-settings__body">
        <div className="st-settings__bar">
          <IconButton
            label="All settings"
            icon={<ArrowLeft />}
            size="sm"
            onClick={() => navigate(base)}
          />
          <span>{(active ?? tabs[0])?.label}</span>
        </div>
        <div className="st-settings__content">
          <h2 className="st-settings__title">{(active ?? tabs[0])?.label}</h2>
          {(active ?? tabs[0])?.render(site)}
        </div>
      </main>
    </section>
  );
}
