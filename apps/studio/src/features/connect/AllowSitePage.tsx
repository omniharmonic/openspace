import { CheckCircle2, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMcpActions, useMcpGrants, useSession, useSite } from "../../api";
import { AppHeader } from "../../app/AppHeader";
import { Button, EmptyState, Spinner } from "../../ui";
import { SignInPanel } from "../auth/SignInPanel";
import "../settings/settings.css";
import "../site-mgmt/manage.css";
import { reaches } from "./LetClaudeEdit";
import "./ConnectAiPage.css";

/**
 * `/connect/allow?app=<connection>&site=<site>` — where an AI app's "not shared yet" answer
 * sends the person: "Allow Claude to edit <site>?" with one button. Only they, signed in, can
 * confirm it (the Hub checks the connection is theirs and that they may connect an AI there).
 */
export function AllowSitePage() {
  const [params] = useSearchParams();
  const appId = params.get("app") ?? "";
  const siteId = params.get("site") ?? "";
  const session = useSession();
  const user = session.data?.user;
  const grants = useMcpGrants(Boolean(user));
  const site = useSite(user ? siteId : undefined);
  const actions = useMcpActions("");
  const [done, setDone] = useState(false);

  let body: ReactNode;
  if (session.isPending) body = <Spinner size={16} label="Loading" />;
  else if (!user)
    body = (
      <>
        <h1 className="st-connect__title">Sign in to allow it</h1>
        <p className="st-connect__lede">
          Only you can let an AI app edit your site. Sign in, and you’ll come straight back here.
        </p>
        <SignInPanel
          github={{ returnTo: `/connect/allow?${params.toString()}` }}
          onSignedIn={() => undefined}
        />
      </>
    );
  else if (grants.isPending || site.isPending) body = <Spinner size={16} label="Loading" />;
  else {
    const app = grants.data?.find((g) => g.id === appId);
    if (!app || site.isError || !site.data)
      body = (
        <EmptyState
          title="This link doesn’t match your account"
          description="The app may have been disconnected, or the site isn’t one of yours. Connect your AI again from the Connect your AI page."
          action={
            <Link to="/connect" className="st-button st-button--secondary">
              Connect your AI
            </Link>
          }
        />
      );
    else if (done || reaches(app, site.data.id))
      body = (
        <>
          <h1 className="st-connect__title">
            <CheckCircle2 aria-hidden="true" /> {app.clientName} can edit {site.data.name}
          </h1>
          <p className="st-connect__lede">
            Go back to your conversation and ask it to carry on — there’s nothing else to set up.
            Its changes go to your draft, and you can undo them in the editor.
          </p>
          <p>
            <Link to={`/sites/${site.data.id}`}>Open {site.data.name} in the editor</Link>
          </p>
        </>
      );
    else {
      const s = site.data;
      body = (
        <>
          <h1 className="st-connect__title">
            <ShieldCheck aria-hidden="true" /> Allow {app.clientName} to edit {s.name}?
          </h1>
          <p className="st-connect__lede">
            {app.clientName} asked to work on <strong>{s.name}</strong>. Its changes go to your
            draft — you see them in the editor and can undo them.{" "}
            {app.publish
              ? "It may publish, and still asks you first each time."
              : "It can’t publish unless you turn that on."}
          </p>
          <div className="st-connect__actions">
            <Button
              variant="primary"
              loading={actions.allowSite.isPending}
              onClick={() =>
                actions.allowSite.mutate(
                  { id: app.id, siteId: s.id },
                  { onSuccess: () => setDone(true) },
                )
              }
            >
              Allow
            </Button>
            <Link to="/connect" className="st-button st-button--ghost">
              Not now
            </Link>
          </div>
        </>
      );
    }
  }

  return (
    <div className="st-page">
      <AppHeader />
      <main className="st-connect st-connect--narrow">{body}</main>
    </div>
  );
}
