import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCheck,
  FolderKanban,
  HandHeart,
  Inbox,
  Mail,
  Mic,
  Newspaper,
  Package,
  Plus,
  Receipt,
  Store,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useApprovals, useForms } from "../../api";
import type { Site } from "../../api/types";
import { cx, IconButton, Spinner } from "../../ui";
import { listCollections } from "../collections/kinds";
import { useDocStore } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";
import { type Area, type WorkspaceRoute, workspacePath } from "./routes";
import "./workspace.css";

export interface AreaProps {
  site: Site;
  route: WorkspaceRoute;
}

const CollectionsArea = lazy(() =>
  import("../collections/CollectionsArea").then((m) => ({ default: m.CollectionsArea })),
);
const ApprovalsView = lazy(() =>
  import("../collections/ApprovalsView").then((m) => ({ default: m.ApprovalsView })),
);
const InboxView = lazy(() => import("../inbox/InboxView").then((m) => ({ default: m.InboxView })));
const SubscribersView = lazy(() =>
  import("../inbox/SubscribersView").then((m) => ({ default: m.SubscribersView })),
);
const MembersView = lazy(() =>
  import("../members/MembersView").then((m) => ({ default: m.MembersView })),
);
const CampaignsArea = lazy(() =>
  import("../marketing/CampaignsArea").then((m) => ({ default: m.CampaignsArea })),
);
const AnalyticsView = lazy(() =>
  import("../analytics/AnalyticsView").then((m) => ({ default: m.AnalyticsView })),
);
const OrdersArea = lazy(() =>
  import("../commerce/OrdersArea").then((m) => ({ default: m.OrdersArea })),
);
const ProductsStockView = lazy(() =>
  import("../commerce/ProductsStockView").then((m) => ({ default: m.ProductsStockView })),
);
const StoreSettingsView = lazy(() =>
  import("../commerce/StoreSettingsView").then((m) => ({ default: m.StoreSettingsView })),
);
const DonationsView = lazy(() =>
  import("../commerce/DonationsView").then((m) => ({ default: m.DonationsView })),
);

const AREA_VIEW: Record<Area, (p: AreaProps) => ReactNode> = {
  content: (p) => <CollectionsArea {...p} />,
  approvals: (p) => <ApprovalsView {...p} />,
  inbox: (p) => <InboxView {...p} />,
  subscribers: (p) => <SubscribersView {...p} />,
  members: (p) => <MembersView {...p} />,
  campaigns: (p) => <CampaignsArea {...p} />,
  analytics: (p) => <AnalyticsView {...p} />,
  orders: (p) => <OrdersArea {...p} />,
  products: (p) => <ProductsStockView {...p} />,
  store: (p) => <StoreSettingsView {...p} />,
  donations: (p) => <DonationsView {...p} />,
};

const KIND_ICON = {
  blog: <Newspaper />,
  events: <CalendarDays />,
  portfolio: <FolderKanban />,
  podcast: <Mic />,
  products: <Package />,
};

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  to: string;
  active: boolean;
  badge?: number;
}

/** Areas a role may open (the Hub enforces the same rules). */
export function areaAllowed(site: Site, area: Area): boolean {
  if (area === "content" || area === "approvals") return true;
  return can(site, "editor");
}

/**
 * Content, inbox, marketing and store screens, over the editor. Wide screens show the section
 * list beside the screen; phones show the list on its own first, like settings.
 */
export function WorkspaceView({ site, route }: AreaProps) {
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const collections = useMemo(() => listCollections(doc), [doc]);
  const editor = can(site, "editor");
  const forms = useForms(site.id, editor);
  const approvals = useApprovals(site.id);
  const unread = forms.data?.reduce((n, f) => n + f.unread, 0) ?? site.inboxCount;
  const pending = approvals.data?.filter((a) => a.status === "pending").length ?? 0;
  const [showList, setShowList] = useState(false);
  const close = () => navigate(`/sites/${site.id}`);
  const go = (to: string) => {
    setShowList(false);
    navigate(to);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("[role='dialog']")) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true'], .ProseMirror")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const p = (area: Area, ...rest: string[]) => workspacePath(site.id, area, ...rest);
  const at = (area: Area) => route.area === area;
  const groups: Array<{ label: string; items: NavItem[] }> = [
    {
      label: "Content",
      items: [
        ...collections.map((c) => ({
          key: `c-${c.name}`,
          label: c.label,
          icon: KIND_ICON[c.kind],
          to: p("content", c.name),
          active: at("content") && route.rest[0] === c.name,
        })),
        {
          key: "approvals",
          label: editor ? "Approvals" : "My submissions",
          icon: <CheckCheck />,
          to: p("approvals"),
          active: at("approvals"),
          badge: editor ? pending : undefined,
        },
        {
          key: "add-collection",
          label: "Add a collection",
          icon: <Plus />,
          to: p("content", "new"),
          active: at("content") && (route.rest[0] === "new" || route.rest.length === 0),
        },
      ],
    },
    ...(editor
      ? [
          {
            label: "Audience",
            items: [
              {
                key: "inbox",
                label: "Form inbox",
                icon: <Inbox />,
                to: p("inbox"),
                active: at("inbox"),
                badge: unread,
              },
              {
                key: "subscribers",
                label: "Subscribers",
                icon: <Users />,
                to: p("subscribers"),
                active: at("subscribers"),
              },
              {
                key: "members",
                label: "Members",
                icon: <UserRound />,
                to: p("members"),
                active: at("members"),
              },
            ],
          },
          {
            label: "Marketing",
            items: [
              {
                key: "campaigns",
                label: "Email campaigns",
                icon: <Mail />,
                to: p("campaigns"),
                active: at("campaigns"),
              },
              {
                key: "analytics",
                label: "Analytics",
                icon: <BarChart3 />,
                to: p("analytics"),
                active: at("analytics"),
              },
            ],
          },
          {
            label: "Store",
            items: [
              {
                key: "orders",
                label: "Orders",
                icon: <Receipt />,
                to: p("orders"),
                active: at("orders"),
              },
              {
                key: "products",
                label: "Products & stock",
                icon: <Package />,
                to: p("products"),
                active: at("products"),
              },
              {
                key: "store",
                label: "Store settings",
                icon: <Store />,
                to: p("store"),
                active: at("store"),
              },
              {
                key: "donations",
                label: "Donations",
                icon: <HandHeart />,
                to: p("donations"),
                active: at("donations"),
              },
            ],
          },
        ]
      : []),
  ];
  const activeItem = groups.flatMap((g) => g.items).find((i) => i.active);
  const allowed = areaAllowed(site, route.area);

  return (
    <section
      className={cx("st-ws", showList ? "show-list" : "show-body")}
      aria-label="Site content and business"
    >
      <nav className="st-ws__nav" aria-label="Sections">
        <div className="st-ws__navhead">
          <h1>{site.name}</h1>
          <IconButton label="Back to the editor" icon={<X />} size="sm" onClick={close} />
        </div>
        {groups.map((g) => (
          <div key={g.label} className="st-ws__group">
            <h2 className="st-ws__grouplabel">{g.label}</h2>
            <ul>
              {g.items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={cx("st-ws__tab", item.active && "is-active")}
                    aria-current={item.active ? "page" : undefined}
                    onClick={() => go(item.to)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className="st-ws__badge">
                        {item.badge}
                        <span className="st-sr-only"> new</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <section className="st-ws__body" aria-label="Workspace">
        <div className="st-ws__bar">
          <IconButton
            label="All sections"
            icon={<ArrowLeft />}
            size="sm"
            onClick={() => setShowList(true)}
          />
          <span>{activeItem?.label ?? ""}</span>
          <IconButton label="Back to the editor" icon={<X />} size="sm" onClick={close} />
        </div>
        <div className="st-ws__content">
          <Suspense
            fallback={
              <div className="st-ws__loading">
                <Spinner size={16} label="Loading" />
              </div>
            }
          >
            {allowed ? (
              AREA_VIEW[route.area]({ site, route })
            ) : (
              <p className="st-ws__denied">
                Your role on this site doesn't include this. Ask the owner if you need it.
              </p>
            )}
          </Suspense>
        </div>
      </section>
    </section>
  );
}
