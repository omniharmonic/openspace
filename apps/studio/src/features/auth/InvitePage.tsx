import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { HubError, queryKeys, useHub, useSession } from "../../api";
import { Wordmark } from "../../app/Wordmark";
import { Button, EmptyState, Spinner } from "../../ui";
import { ROLE_INFO } from "../settings/CollaboratorsSettings";
import { SignInPanel } from "./SignInPanel";
import "./SignInPage.css";

const CLOSED: Record<string, string> = {
  accepted: "This invitation has already been used.",
  revoked: "This invitation was cancelled. Ask for a new one.",
  expired: "This invitation has expired. Ask for a new one.",
};

/**
 * `/invite/:token` — where invitation links (email and "send them this link") land: who invited
 * you to which site and role, sign in if needed, then accept and open the site.
 */
export function InvitePage() {
  const { token = "" } = useParams();
  const hub = useHub();
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => {
      if (!hub.getInvitation) throw new HubError(404, "not_found", "Invitations aren't available.");
      return hub.getInvitation(token);
    },
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => {
      if (!hub.acceptInvitation)
        throw new HubError(404, "not_found", "Invitations aren't available.");
      return hub.acceptInvitation(token);
    },
    onSuccess: async ({ siteId }) => {
      await qc.invalidateQueries({ queryKey: queryKeys.sites });
      navigate(`/sites/${siteId}`, { replace: true });
    },
  });

  if (invitation.isPending || session.isPending)
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading" />
      </div>
    );
  const inv = invitation.data;
  if (!inv)
    return (
      <div className="st-center">
        <EmptyState
          title="This invitation link doesn't work"
          description="It may be mistyped or too old. Ask the person who invited you for a new link."
          action={
            <Button variant="primary" onClick={() => navigate("/")}>
              Go home
            </Button>
          }
        />
      </div>
    );

  const role = ROLE_INFO[inv.role];
  const signedIn = !!session.data?.user;
  return (
    <div className="st-signin-page">
      <div className="st-signin-page__card">
        <Wordmark to="/templates" />
        <h1 className="st-signin-page__title">Join {inv.siteName}</h1>
        <p>
          {inv.invitedBy} invited you as <strong>{role.name}</strong>. {role.does}
        </p>
        {inv.status !== "pending" ? (
          <p role="alert">{CLOSED[inv.status] ?? "This invitation can't be used."}</p>
        ) : signedIn ? (
          <>
            <Button variant="primary" loading={accept.isPending} onClick={() => accept.mutate()}>
              Accept invitation
            </Button>
            {accept.error && <p role="alert">{accept.error.message}</p>}
          </>
        ) : (
          <SignInPanel github={{ returnTo: `/invite/${token}` }} onSignedIn={() => undefined} />
        )}
      </div>
    </div>
  );
}
