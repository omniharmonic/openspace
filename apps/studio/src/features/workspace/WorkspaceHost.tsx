import {
  BarChart3,
  Inbox,
  Mail,
  Newspaper,
  Plus,
  Receipt,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { IconButton, Spinner, useRegisterCommands } from "../../ui";
import { listCollections } from "../collections/kinds";
import { useDocStore } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";
import { type Area, workspacePath, workspaceRoute } from "./routes";
import "./rail.css";

const WorkspaceView = lazy(() =>
  import("./WorkspaceView").then((m) => ({ default: m.WorkspaceView })),
);

/**
 * Mounted once inside the editor: opens the workspace screens (`/sites/:id/<area>/…`) over the
 * canvas and adds their ⌘K commands.
 */
export function WorkspaceHost({ site }: { site: Site }) {
  const location = useLocation();
  const navigate = useNavigate();
  const route = workspaceRoute(location.pathname);
  const doc = useDocStore((s) => s.doc);
  const go = (area: Area, ...rest: string[]) => navigate(workspacePath(site.id, area, ...rest));
  const editor = can(site, "editor");
  const collections = listCollections(doc);

  useRegisterCommands("workspace", [
    ...collections.map((c) => ({
      id: `content-${c.name}`,
      label: `Open ${c.label}`,
      group: "Content",
      icon: <Newspaper />,
      run: () => go("content", c.name),
    })),
    ...collections.map((c) => ({
      id: `content-new-${c.name}`,
      label: `New ${c.itemLabel.toLowerCase()} in ${c.label}`,
      group: "Content",
      icon: <Plus />,
      run: () => go("content", c.name, "new"),
    })),
    {
      id: "content-add-collection",
      label: "Add a blog, events, shop…",
      group: "Content",
      icon: <Plus />,
      run: () => go("content", "new"),
    },
    ...(editor
      ? [
          {
            id: "ws-inbox",
            label: "Form inbox",
            group: "Audience",
            icon: <Inbox />,
            run: () => go("inbox"),
          },
          {
            id: "ws-subscribers",
            label: "Subscribers",
            group: "Audience",
            icon: <Users />,
            run: () => go("subscribers"),
          },
          {
            id: "ws-members",
            label: "Members",
            group: "Audience",
            icon: <UserRound />,
            run: () => go("members"),
          },
          {
            id: "ws-campaign",
            label: "Write an email campaign",
            group: "Marketing",
            icon: <Mail />,
            run: () => go("campaigns", "new"),
          },
          {
            id: "ws-analytics",
            label: "Analytics",
            group: "Marketing",
            icon: <BarChart3 />,
            run: () => go("analytics"),
          },
          {
            id: "ws-orders",
            label: "Orders",
            group: "Store",
            icon: <Receipt />,
            run: () => go("orders"),
          },
          {
            id: "ws-store",
            label: "Store settings",
            group: "Store",
            icon: <Store />,
            run: () => go("store"),
          },
        ]
      : []),
  ]);

  if (!route) return null;
  return (
    <Suspense
      fallback={
        <div className="st-settings-loading">
          <Spinner size={16} label="Opening" />
        </div>
      }
    >
      <WorkspaceView site={site} route={route} />
    </Suspense>
  );
}

/** Rail buttons for the workspace (placed below the editor panels). */
export function WorkspaceRail({ site }: { site: Site }) {
  const navigate = useNavigate();
  const location = useLocation();
  const route = workspaceRoute(location.pathname);
  const editor = can(site, "editor");
  const go = (area: Area) => navigate(workspacePath(site.id, area));
  const isIn = (...areas: Area[]) => Boolean(route && areas.includes(route.area));
  return (
    <>
      <span className="st-ed-rail__sep" aria-hidden="true" />
      <IconButton
        label="Content"
        icon={<Newspaper />}
        tooltipSide="right"
        active={isIn("content", "approvals") || undefined}
        onClick={() => go("content")}
      />
      {editor && (
        <>
          <IconButton
            label="Inbox and people"
            icon={<Inbox />}
            tooltipSide="right"
            active={isIn("inbox", "subscribers", "members") || undefined}
            onClick={() => go("inbox")}
          />
          <IconButton
            label="Marketing"
            className="st-ed-hide-narrow"
            icon={<Mail />}
            tooltipSide="right"
            active={isIn("campaigns") || undefined}
            onClick={() => go("campaigns")}
          />
          <IconButton
            label="Analytics"
            icon={<BarChart3 />}
            tooltipSide="right"
            active={isIn("analytics") || undefined}
            className="st-ed-hide-narrow"
            onClick={() => go("analytics")}
          />
          <IconButton
            label="Store"
            className="st-ed-hide-narrow"
            icon={<Store />}
            tooltipSide="right"
            active={isIn("orders", "products", "store", "donations") || undefined}
            onClick={() => go("orders")}
          />
        </>
      )}
    </>
  );
}
