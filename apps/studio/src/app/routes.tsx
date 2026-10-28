import {
  ArrowRightLeft,
  Bot,
  LayoutGrid,
  LayoutTemplate,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  SwatchBook,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect } from "react";
import { Navigate, Outlet, type RouteObject, useNavigate, useRouteError } from "react-router";
import { useLogout, useSession } from "../api";
import { InvitePage } from "../features/auth/InvitePage";
import { SignInPage } from "../features/auth/SignInPage";
import { AllowSitePage } from "../features/connect/AllowSitePage";
import { ConnectAiPage } from "../features/connect/ConnectAiPage";
import { Dashboard } from "../features/dashboard/Dashboard";
import { MoveProgress } from "../features/move/MoveProgress";
import { MoveSite } from "../features/move/MoveSite";
import { NewSite } from "../features/onboarding/NewSite";
import { StartHandoff } from "../features/start/StartHandoff";
import { StartInClaude } from "../features/start/StartInClaude";
import { StartWithClaude } from "../features/start/StartWithClaude";
import { TemplateGallery } from "../features/templates/TemplateGallery";
import { Button, EmptyState, Spinner, useRegisterCommands } from "../ui";
import { type StudioConfig, useConfig } from "./config";
import { claimStaleReload, isStaleBuildError } from "./stale-build";
import { useThemeStore } from "./theme";

// Heavier screens load on demand.
const EditorFrame = lazy(() =>
  import("../features/editor/EditorFrame").then((m) => ({ default: m.EditorFrame })),
);
const KitPage = lazy(() => import("../features/kit/KitPage").then((m) => ({ default: m.KitPage })));

function Loading({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="st-center">
          <Spinner size={18} label="Loading" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/** App-wide commands available from ⌘K on every screen. */
function GlobalCommands() {
  const navigate = useNavigate();
  const session = useSession();
  const logout = useLogout();
  const setTheme = useThemeStore((s) => s.setPreference);
  const { showKit } = useConfig();
  const user = session.data?.user;
  useRegisterCommands("global", [
    ...(user
      ? [
          {
            id: "go-sites",
            label: "Go to your sites",
            group: "Go to",
            icon: <LayoutGrid />,
            run: () => navigate("/sites"),
          },
        ]
      : []),
    {
      id: "go-connect",
      label: "Connect your AI (Claude)",
      group: "Go to",
      icon: <Bot />,
      run: () => navigate("/connect"),
    },
    {
      id: "go-start",
      label: "Start a new site with Claude",
      group: "Go to",
      icon: <Sparkles />,
      keywords: ["claude", "brand"],
      run: () => navigate("/start"),
    },
    {
      id: "go-move",
      label: "Move an existing site to OpenSpace",
      group: "Go to",
      icon: <ArrowRightLeft />,
      keywords: ["import", "migrate", "squarespace", "wordpress", "wix", "github pages"],
      run: () => navigate("/move"),
    },
    {
      id: "go-templates",
      label: "Browse templates",
      group: "Go to",
      icon: <LayoutTemplate />,
      run: () => navigate("/templates"),
    },
    ...(showKit
      ? [
          {
            id: "go-kit",
            label: "Open UI kit",
            group: "Go to",
            icon: <SwatchBook />,
            run: () => navigate("/kit"),
          },
        ]
      : []),
    {
      id: "theme-light",
      label: "Use light theme",
      group: "Appearance",
      icon: <Sun />,
      run: () => setTheme("light"),
    },
    {
      id: "theme-dark",
      label: "Use dark theme",
      group: "Appearance",
      icon: <Moon />,
      run: () => setTheme("dark"),
    },
    {
      id: "theme-system",
      label: "Match system theme",
      group: "Appearance",
      icon: <Monitor />,
      run: () => setTheme("system"),
    },
    user
      ? {
          id: "sign-out",
          label: "Sign out",
          group: "Account",
          icon: <LogOut />,
          run: () => logout.mutate(undefined, { onSuccess: () => navigate("/templates") }),
        }
      : {
          id: "sign-in",
          label: "Sign in",
          group: "Account",
          icon: <LogIn />,
          run: () => navigate("/signin"),
        },
  ]);
  return null;
}

function RootLayout() {
  return (
    <>
      <GlobalCommands />
      <Outlet />
    </>
  );
}

/** `/`: signed in → dashboard; signed out → marketing site (when configured) or the template gallery. */
function Home() {
  const session = useSession();
  const { marketingUrl } = useConfig();
  const signedOut = session.isSuccess && !session.data.user;
  useEffect(() => {
    if (signedOut && marketingUrl) window.location.replace(marketingUrl);
  }, [signedOut, marketingUrl]);
  if (session.isPending || (signedOut && marketingUrl)) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading" />
      </div>
    );
  }
  return <Navigate to={session.data?.user ? "/sites" : "/templates"} replace />;
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="st-center">
      <EmptyState
        level={1}
        title="There’s nothing at this address"
        description="The link may be out of date. Your sites and templates are a click away."
        action={
          <Button variant="primary" onClick={() => navigate("/")}>
            Go home
          </Button>
        }
      />
    </main>
  );
}

/** Any error a screen throws: plain words and a way on, never the router's developer page. */
function RouteError() {
  const error = useRouteError();
  const stale = isStaleBuildError(error);
  const reloading = stale && claimStaleReload(sessionStorageOrNull());
  useEffect(() => {
    if (reloading) window.location.reload();
  }, [reloading]);
  if (reloading)
    return (
      <main className="st-center">
        <Spinner />
      </main>
    );
  return (
    <main className="st-center">
      <EmptyState
        level={1}
        title={stale ? "Studio was just updated" : "Something went wrong on this screen"}
        description={
          stale
            ? "Reload to get the new version. Your work is saved."
            : "Your work is saved. Reload to try again — if it keeps happening, tell us what you were doing."
        }
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      />
    </main>
  );
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function createRoutes(config: Pick<StudioConfig, "showKit">): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Home /> },
        { path: "templates", element: <TemplateGallery /> },
        { path: "new/:template", element: <NewSite /> },
        // Start with Claude happens in Claude: connect once, then a ready first message.
        { path: "start", element: <StartInClaude /> },
        // The quick form (brief + brand files → a site), one link away.
        { path: "start/form", element: <StartWithClaude /> },
        { path: "start/:siteId", element: <StartHandoff /> },
        { path: "move", element: <MoveSite /> },
        { path: "move/:importId", element: <MoveProgress /> },
        { path: "signin", element: <SignInPage /> },
        { path: "invite/:token", element: <InvitePage /> },
        { path: "sites", element: <Dashboard /> },
        { path: "connect", element: <ConnectAiPage /> },
        { path: "connect/allow", element: <AllowSitePage /> },
        {
          path: "sites/:id/*",
          element: (
            <Loading>
              <EditorFrame />
            </Loading>
          ),
        },
        ...(config.showKit
          ? [
              {
                path: "kit",
                element: (
                  <Loading>
                    <KitPage />
                  </Loading>
                ),
              },
            ]
          : []),
        { path: "*", element: <NotFound /> },
      ],
    },
  ];
}
