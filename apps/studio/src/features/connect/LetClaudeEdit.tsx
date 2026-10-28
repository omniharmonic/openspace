import { CheckCircle2, Sparkles } from "lucide-react";
import { useMcpActions, useMcpGrants, useSession } from "../../api";
import type { McpGrant } from "../../api/manage-types";
import { Button, toast } from "../../ui";

/** Can this AI app edit the site already? */
export const reaches = (g: McpGrant, siteId: string) =>
  Boolean(g.allSites) || g.sites.some((s) => s.id === siteId);

/**
 * "Let Claude edit this site" — one click, for a site made in Studio while the person already has
 * Claude connected (connections only cover the sites they were given, unless "all my sites" is
 * on). Renders nothing when there's no connected app, and a quiet confirmation once it can.
 */
export function LetClaudeEdit({
  site,
  showDone = false,
}: {
  site: { id: string; name: string };
  showDone?: boolean;
}) {
  const session = useSession();
  const signedIn = Boolean(session.data?.user);
  const grants = useMcpGrants(signedIn);
  const actions = useMcpActions("");
  if (!signedIn || !grants.data?.length) return null;
  const missing = grants.data.filter((g) => !reaches(g, site.id));
  if (!missing.length)
    return showDone ? (
      <p className="st-letclaude st-letclaude--done">
        <CheckCircle2 aria-hidden="true" /> {grants.data[0]?.clientName ?? "Claude"} can edit{" "}
        {site.name}.
      </p>
    ) : null;
  return (
    <div className="st-letclaude">
      {missing.map((g) => (
        <Button
          key={g.id}
          size="sm"
          icon={<Sparkles />}
          loading={actions.allowSite.isPending}
          onClick={() =>
            actions.allowSite.mutate(
              { id: g.id, siteId: site.id },
              {
                onSuccess: () =>
                  toast({
                    tone: "success",
                    title: `${g.clientName} can edit ${site.name} now`,
                    description: "Ask it in your conversation — no need to reconnect.",
                  }),
              },
            )
          }
        >
          Let {g.clientName} edit this site
        </Button>
      ))}
    </div>
  );
}
