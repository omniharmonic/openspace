import { Bot, LayoutGrid, LogOut, Search } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { useLogout, useSession } from "../api";
import { InstallButton } from "../pwa/PwaUi";
import { Avatar, Button, Kbd, Menu, useCommandStore } from "../ui";
import "./AppHeader.css";
import { ThemeButton } from "./ThemeButton";
import { Wordmark } from "./Wordmark";

export function UserMenu() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const user = session.data?.user;
  if (!user) return null;
  return (
    <Menu
      align="end"
      label="Account"
      trigger={
        <button type="button" className="st-header__user">
          {/* Named by content (not aria-label), so the name contains the avatar's own text. */}
          <span className="st-visually-hidden">Account: </span>
          <Avatar person={{ id: user.id, name: user.name, avatarUrl: user.avatarUrl }} size={24} />
        </button>
      }
      items={[
        { type: "label", label: `Signed in as ${user.login}` },
        { label: "Your sites", icon: <LayoutGrid />, onSelect: () => navigate("/sites") },
        { label: "Connect your AI", icon: <Bot />, onSelect: () => navigate("/connect") },
        { type: "separator" },
        {
          label: "Sign out",
          icon: <LogOut />,
          onSelect: () => logout.mutate(undefined, { onSuccess: () => navigate("/templates") }),
        },
      ]}
    />
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  const session = useSession();
  const user = session.data?.user;
  const openPalette = useCommandStore((s) => s.setOpen);
  const navigate = useNavigate();
  return (
    <header className="st-header">
      <div className="st-header__left">
        <Wordmark to={user ? "/sites" : "/templates"} />
        <nav className="st-header__nav" aria-label="Main">
          {user && (
            <NavLink to="/sites" end className="st-header__link">
              Your sites
            </NavLink>
          )}
          <NavLink to="/templates" className="st-header__link">
            Templates
          </NavLink>
          {user && (
            <NavLink to="/connect" className="st-header__link" aria-label="Connect your AI">
              <span className="st-header__long">Connect your AI</span>
              <span className="st-header__short" aria-hidden="true">
                Your AI
              </span>
            </NavLink>
          )}
        </nav>
      </div>
      {children}
      <div className="st-header__right">
        <button type="button" className="st-header__search" onClick={() => openPalette(true)}>
          <Search aria-hidden="true" />
          <span>Search</span>
          <Kbd shortcut="mod+k" />
        </button>
        <InstallButton />
        <ThemeButton />
        {user ? (
          <UserMenu />
        ) : session.isSuccess ? (
          <Button size="sm" variant="secondary" onClick={() => navigate("/signin")}>
            Sign in
          </Button>
        ) : null}
      </div>
    </header>
  );
}
