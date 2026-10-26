import { LayoutGrid, LayoutTemplate, LogIn, LogOut, Monitor, Moon, Sun, SwatchBook } from "lucide-react";
import { useEffect } from "react";
import { Navigate, Outlet, type RouteObject, useNavigate } from "react-router";
import { useLogout, useSession } from "../api";
import { SignInPage } from "../features/auth/SignInPage";
import { Dashboard } from "../features/dashboard/Dashboard";
import { EditorFrame } from "../features/editor/EditorFrame";
import { KitPage } from "../features/kit/KitPage";
import { NewSite } from "../features/onboarding/NewSite";
import { TemplateGallery } from "../features/templates/TemplateGallery";
import { Button, EmptyState, Spinner, useRegisterCommands } from "../ui";
import { type StudioConfig, useConfig } from "./config";
import { useThemeStore } from "./theme";

/** App-wide commands available from ⌘K on every screen. */
function GlobalCommands() {
  const navigate = useNavigate();
  const session = useSession();
  const logout = useLogout();
  const setTheme = useThemeStore((s) => s.setPreference);
  const { showKit } = useConfig();
  const user = session.data?.user;
  useRegisterCommands("global", [
    ...(user ? [{ id: "go-sites", label: "Go to your sites", group: "Go to", icon: <LayoutGrid />, run: () => navigate("/sites") }] : []),
    { id: "go-templates", label: "Browse templates", group: "Go to", icon: <LayoutTemplate />, run: () => navigate("/templates") },
    ...(showKit ? [{ id: "go-kit", label: "Open UI kit", group: "Go to", icon: <SwatchBook />, run: () => navigate("/kit") }] : []),
    { id: "theme-light", label: "Use light theme", group: "Appearance", icon: <Sun />, run: () => setTheme("light") },
    { id: "theme-dark", label: "Use dark theme", group: "Appearance", icon: <Moon />, run: () => setTheme("dark") },
    { id: "theme-system", label: "Match system theme", group: "Appearance", icon: <Monitor />, run: () => setTheme("system") },
    user
      ? {
          id: "sign-out",
          label: "Sign out",
          group: "Account",
          icon: <LogOut />,
          run: () => logout.mutate(undefined, { onSuccess: () => navigate("/templates") }),
        }
      : { id: "sign-in", label: "Sign in", group: "Account", icon: <LogIn />, run: () => navigate("/signin") },
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
    <div className="st-center">
      <EmptyState
        title="There’s nothing at this address"
        description="The link may be out of date. Your sites and templates are a click away."
        action={
          <Button variant="primary" onClick={() => navigate("/")}>
            Go home
          </Button>
        }
      />
    </div>
  );
}

export function createRoutes(config: Pick<StudioConfig, "showKit">): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      children: [
        { index: true, element: <Home /> },
        { path: "templates", element: <TemplateGallery /> },
        { path: "new/:template", element: <NewSite /> },
        { path: "signin", element: <SignInPage /> },
        { path: "sites", element: <Dashboard /> },
        { path: "sites/:id/*", element: <EditorFrame /> },
        ...(config.showKit ? [{ path: "kit", element: <KitPage /> }] : []),
        { path: "*", element: <NotFound /> },
      ],
    },
  ];
}
