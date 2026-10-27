import { Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { type McpToken, useMcpActions, useMcpTokens } from "../../api";
import type { Site } from "../../api/types";
import { Badge, Button, Input, Spinner, Tabs, Toggle, toast } from "../../ui";

import {
  AppsWithAccess,
  ClaudeAppSkills,
  ClaudeAppSteps,
  ClaudeCodeSteps,
  CopyLine,
  copy,
  when,
} from "../connect/ConnectSteps";

export {
  CLAUDE_APP_SKILLS,
  CopyLine,
  DOCS_URL,
  PLUGIN_COMMANDS,
} from "../connect/ConnectSteps";

function TokenRow({
  token,
  fresh,
  canAllowPublish,
  onRevoke,
  onPublish,
}: {
  token: McpToken;
  /** The full link, only for a link made in this visit (the Hub never shows it again). */
  fresh: string | null;
  /** Only the site owner may let a link publish. */
  canAllowPublish: boolean;
  onRevoke: () => void;
  onPublish: (publish: boolean) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const publishes = token.publish === true;
  return (
    <li className="st-token">
      <div className="st-token__head">
        <span className="st-token__label">
          <Link2 aria-hidden="true" /> {token.label}
        </span>
        <span className="st-muted-note">
          Made {when(token.createdAt)} · last used {when(token.lastUsedAt)}
        </span>
      </div>
      {fresh ? (
        <>
          <CopyLine value={fresh} label="connection link" />
          <p className="st-muted-note" role="note">
            <strong>Copy it now:</strong> for your security, the full link is only shown once.
          </p>
        </>
      ) : (
        <>
          <code className="st-code st-token__masked">{token.url}</code>
          <p className="st-muted-note">
            Only the start and end are shown — the full link was shown once, when it was made. Lost
            it? Make a new link below and turn this one off.
          </p>
        </>
      )}
      <div className="st-token__publish">
        {publishes ? (
          <Badge tone="pending">Can publish · asks you before each publish</Badge>
        ) : (
          <span className="st-muted-note">Draft only: changes wait for you to publish.</span>
        )}
        {canAllowPublish &&
          (confirmPublish ? (
            <div className="st-token__confirm" role="alert">
              <span className="st-media-warn">
                Anyone who has this link could then publish to your live site. Only allow this for a
                link you keep private; you can turn it off here at any time.
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmPublish(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setConfirmPublish(false);
                  onPublish(true);
                }}
              >
                Allow publishing
              </Button>
            </div>
          ) : (
            <span className="st-grant__publish">
              <span>Allow this link to publish</span>
              <Toggle
                size="sm"
                checked={publishes}
                aria-label={`Allow the ${token.label} link to publish`}
                onCheckedChange={(on) => (on ? setConfirmPublish(true) : onPublish(false))}
              />
            </span>
          ))}
      </div>
      <div className="st-row-actions">
        {confirm ? (
          <>
            <span className="st-media-warn">Any AI using this link loses access.</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
            <Button size="sm" variant="danger" onClick={onRevoke}>
              Turn off link
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setConfirm(true)}>
            Turn off
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Connect your AI (PRD §4.4, FR-40): three separate flows — Claude Code and the Claude app sign
 * in to the Hub's `/mcp` (OAuth, URL from `VITE_HUB_URL`), or a personal link (no sign-in,
 * draft-only unless the owner allows it to publish) — plus the apps that have access.
 */
export function ConnectAiSettings({ site }: { site: Site }) {
  const tokens = useMcpTokens(site.id);
  const actions = useMcpActions(site.id);
  const [label, setLabel] = useState("Claude");
  // The just-made link in full (the Hub only returns it once; lists show it masked).
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const first = tokens.data?.[0];
  const isOwner = (site.role ?? "owner") === "owner";
  const freshUrl = fresh && tokens.data?.some((t) => t.id === fresh.id) ? fresh.url : null;

  const create = () =>
    actions.createToken.mutate(label.trim() || "Claude", {
      onSuccess: (t) => {
        setFresh({ id: t.id, url: t.url });
        void copy(t.url, "Connection link");
      },
      onError: (err) =>
        toast({ tone: "danger", title: "Couldn’t make a link", description: err.message }),
    });

  return (
    <div className="st-settings__stack">
      <p className="st-settings__lede">
        Let your own AI assistant edit {site.name}: add pages, rewrite text, change styles and write
        blog posts. Its changes land in your draft, and you see them here as they happen. You bring
        the AI; OpenSpace never charges for it.
      </p>

      <section className="st-card" aria-labelledby="ai-link">
        <div className="st-card__head">
          <div>
            <h3 id="ai-link" className="st-card__title">
              Your connection link
            </h3>
            <p className="st-card__desc">
              Personal to you, for {site.name} only, with no sign-in step. Anyone with it can edit
              the draft, so keep it private. A link can't publish unless you allow it.
            </p>
          </div>
        </div>
        {tokens.isPending ? (
          <Spinner size={14} label="Loading" />
        ) : tokens.data && tokens.data.length > 0 ? (
          <ul className="st-tokens">
            {tokens.data.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                fresh={fresh?.id === t.id ? fresh.url : null}
                canAllowPublish={isOwner}
                onRevoke={() => actions.revokeToken.mutate(t.id)}
                onPublish={(publish) =>
                  actions.setTokenPublish.mutate(
                    { id: t.id, publish },
                    {
                      onSuccess: () =>
                        toast({
                          title: publish
                            ? `${t.label} link can publish`
                            : `${t.label} link is draft-only again`,
                        }),
                      onError: (err) =>
                        toast({
                          tone: "danger",
                          title: "Couldn’t change that link",
                          description: err.message,
                        }),
                    },
                  )
                }
              />
            ))}
          </ul>
        ) : null}
        <form
          className="st-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Input
            aria-label="Name for this link"
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Claude on my laptop"
          />
          <Button
            type="submit"
            variant={first ? "secondary" : "primary"}
            icon={<Plus />}
            loading={actions.createToken.isPending}
          >
            {first ? "Make another link" : "Make my link"}
          </Button>
        </form>
      </section>

      <section className="st-card" aria-labelledby="ai-how">
        <h3 id="ai-how" className="st-card__title">
          How to connect
        </h3>
        <Tabs
          aria-label="AI app"
          items={[
            {
              value: "claude",
              label: "Claude app (easiest)",
              content: (
                <div className="st-settings__stack">
                  <ClaudeAppSteps siteName={site.name} />
                  <ClaudeAppSkills />
                </div>
              ),
            },
            {
              value: "code",
              label: "Claude Code",
              content: (
                <div className="st-settings__stack">
                  <ClaudeCodeSteps siteName={site.name} />
                  <p className="st-muted-note">
                    Rather not sign in? Use your personal link instead (see{" "}
                    <strong>Personal link</strong>).
                  </p>
                </div>
              ),
            },
            {
              value: "link",
              label: "Personal link",
              content: (
                <div className="st-settings__stack">
                  <p className="st-muted-note">
                    Your link works without signing in, for this site only. It edits the draft; it
                    can publish only if you allow that on the link above.
                  </p>
                  <ol className="st-steps">
                    <li className={first ? "is-done" : undefined}>
                      <div>
                        <strong>Make your link</strong> above and copy it.
                      </div>
                    </li>
                    <li>
                      <div>
                        <strong>Claude Code:</strong> run
                      </div>
                      {freshUrl ? (
                        <CopyLine
                          value={`claude mcp add --transport http openspace ${freshUrl}`}
                          label="command"
                        />
                      ) : (
                        <code className="st-code">
                          claude mcp add --transport http openspace "&lt;your link&gt;"
                        </code>
                      )}
                    </li>
                    <li>
                      <strong>claude.ai or Claude Desktop:</strong> Settings → Connectors → Add
                      custom connector, and paste the link as the URL. No sign-in step.
                    </li>
                    <li>
                      <strong>Other apps</strong> that support MCP over HTTP: add the link as a
                      remote server.
                    </li>
                  </ol>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section className="st-card" aria-labelledby="ai-grants">
        <h3 id="ai-grants" className="st-card__title">
          Apps with access
        </h3>
        <AppsWithAccess />
      </section>
    </div>
  );
}
