import { Check, Copy, Link2, Plus, Terminal, Trash2, Unplug } from "lucide-react";
import { useState } from "react";
import { hubMcpUrl, type McpToken, useMcpActions, useMcpGrants, useMcpTokens } from "../../api";
import type { Site } from "../../api/types";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Spinner,
  Tabs,
  Toggle,
  toast,
} from "../../ui";

/**
 * The OpenSpace plugin for Claude Code: skills and slash commands (design check, new page, …).
 * Its own MCP server works on site folders on your computer; Studio sites connect to the Hub.
 */
export const PLUGIN_COMMANDS = [
  "/plugin marketplace add omniharmonic/openspace",
  "/plugin install openspace",
] as const;

/**
 * Skills for claude.ai and Claude Desktop (Customize → Skills → upload the .zip), built by the
 * docs site (apps/docs/scripts/skills.mjs). No installs: they use this connector only.
 */
export const DOCS_URL = "https://docs.openspace.host";
export const CLAUDE_APP_SKILLS = [
  { name: "openspace-migrate", what: "move a site from Squarespace, GitHub Pages or anywhere" },
  { name: "openspace-web-design", what: "design pages, checking screenshots as it goes" },
  { name: "openspace-content", what: "blog posts, events and products" },
  { name: "openspace-site-setup", what: "publishing and your domain" },
] as const;

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ tone: "success", title: `${what} copied` });
  } catch {
    toast({ tone: "danger", title: "Couldn’t copy", description: text });
  }
}

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CopyLine({
  value,
  label,
  mono = true,
}: {
  value: string;
  label: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="st-copyline">
      <code className={mono ? "st-code" : undefined}>{value}</code>
      <Button
        size="sm"
        icon={copied ? <Check /> : <Copy />}
        aria-label={`Copy ${label}`}
        onClick={() => {
          void copy(value, label);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** A drawn (unbranded) sketch of the step, standing in for a screenshot. */
function StepSketch({ kind }: { kind: "settings" | "add" | "allow" }) {
  return (
    <span className={`st-sketch st-sketch--${kind}`} aria-hidden="true">
      <span className="st-sketch__bar" />
      {kind === "settings" && (
        <>
          <span className="st-sketch__side">
            <i />
            <i className="is-on" />
            <i />
          </span>
          <span className="st-sketch__main">
            <b>Connectors</b>
            <em>Add custom connector</em>
          </span>
        </>
      )}
      {kind === "add" && (
        <span className="st-sketch__modal">
          <b>Add custom connector</b>
          <i>OpenSpace</i>
          <i className="is-url">https://…/mcp</i>
          <em>Add</em>
        </span>
      )}
      {kind === "allow" && (
        <span className="st-sketch__modal">
          <b>Allow Claude to edit</b>
          <i className="is-check">☑ Your site</i>
          <i className="is-check">☐ Allow publishing</i>
          <em>Allow</em>
        </span>
      )}
    </span>
  );
}

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
  const grants = useMcpGrants();
  const actions = useMcpActions(site.id);
  const [label, setLabel] = useState("Claude");
  // The just-made link in full (the Hub only returns it once; lists show it masked).
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const first = tokens.data?.[0];
  const isOwner = (site.role ?? "owner") === "owner";
  const mcpUrl = hubMcpUrl();
  const claudeCodeCommand = `claude mcp add --transport http openspace ${mcpUrl}`;
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
              value: "code",
              label: "Claude Code",
              content: (
                <div className="st-settings__stack">
                  <ol className="st-steps">
                    <li>
                      <div>
                        <Terminal aria-hidden="true" /> In a terminal, add OpenSpace to Claude Code:
                      </div>
                      <CopyLine value={claudeCodeCommand} label="command" />
                    </li>
                    <li>
                      In Claude Code, type <code className="st-code">/mcp</code>, pick{" "}
                      <strong>openspace</strong> and choose <strong>Authenticate</strong>.
                    </li>
                    <li>
                      Sign in with GitHub, tick <strong>{site.name}</strong>, and decide whether
                      Claude may publish (off unless you choose it). You can change this below.
                    </li>
                    <li>
                      Ask Claude something like{" "}
                      <em>“Add an FAQ section to my home page about class sizes.”</em>
                    </li>
                  </ol>
                  <p className="st-muted-note">
                    Rather not sign in? Use your personal link instead (see{" "}
                    <strong>Personal link</strong>).
                  </p>
                  <p className="st-muted-note">
                    <strong>Optional:</strong> the OpenSpace plugin adds skills and slash commands,
                    such as a design check. Its own built-in server is for site folders on your
                    computer, so for {site.name} keep the connection above.
                  </p>
                  {PLUGIN_COMMANDS.map((c) => (
                    <CopyLine key={c} value={c} label="command" />
                  ))}
                </div>
              ),
            },
            {
              value: "claude",
              label: "Claude app",
              content: (
                <div className="st-settings__stack">
                  <ol className="st-steps st-steps--sketch">
                    <li>
                      <div>
                        In claude.ai or Claude Desktop, open <strong>Settings → Connectors</strong>{" "}
                        and choose <strong>Add custom connector</strong>.
                      </div>
                      <StepSketch kind="settings" />
                    </li>
                    <li>
                      <div>
                        Name it <strong>OpenSpace</strong>, use this URL, and click{" "}
                        <strong>Add</strong>:
                        <CopyLine value={mcpUrl} label="connector URL" />
                      </div>
                      <StepSketch kind="add" />
                    </li>
                    <li>
                      <div>
                        Sign in with GitHub when asked, tick <strong>{site.name}</strong>, and
                        decide whether Claude may publish. You can change this below at any time.
                      </div>
                      <StepSketch kind="allow" />
                    </li>
                    <li>
                      Ask Claude something like{" "}
                      <em>“Add an FAQ section to my home page about class sizes.”</em>
                    </li>
                  </ol>
                  <section className="st-settings__stack" aria-labelledby="ai-skills">
                    <h4 id="ai-skills" className="st-card__title">
                      Add the OpenSpace skills
                    </h4>
                    <p className="st-muted-note">
                      Skills teach Claude how to do these jobs well. Nothing to install: download a
                      file below (don’t unzip it), then in Claude open{" "}
                      <strong>Customize → Skills</strong>, choose <strong>Upload a skill</strong>,
                      pick the file and turn the skill on.
                    </p>
                    <ul className="st-steps">
                      {CLAUDE_APP_SKILLS.map((s) => (
                        <li key={s.name}>
                          <a href={`${DOCS_URL}/skills/${s.name}.zip`} download>
                            {s.name}.zip
                          </a>{" "}
                          — {s.what}
                        </li>
                      ))}
                    </ul>
                    <p className="st-muted-note">
                      <a
                        href={`${DOCS_URL}/connect-your-ai/claude-app/`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Step-by-step guide and example requests
                      </a>
                    </p>
                  </section>
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
        {grants.isPending ? (
          <Spinner size={14} label="Loading" />
        ) : !grants.data?.length ? (
          <EmptyState
            size="sm"
            icon={<Unplug />}
            title="No apps connected yet"
            description="Once you connect Claude, it shows up here."
          />
        ) : (
          <ul className="st-grants">
            {grants.data.map((g) => (
              <li key={g.id} className="st-grant">
                <div className="st-grant__main">
                  <strong>{g.clientName}</strong>
                  <span className="st-muted-note">
                    {g.sites.length ? g.sites.map((s) => s.name).join(", ") : "Sites you choose"} ·
                    last used {when(g.lastUsedAt)}
                  </span>
                </div>
                <div className="st-grant__publish">
                  <span id={`grant-${g.id}`}>Can publish</span>
                  <Toggle
                    size="sm"
                    checked={g.publish}
                    aria-label={`${g.clientName} can publish`}
                    onCheckedChange={(publish) => actions.setPublish.mutate({ id: g.id, publish })}
                  />
                </div>
                {g.publish && <Badge tone="pending">Asks you before each publish</Badge>}
                <IconButton
                  label={`Disconnect ${g.clientName}`}
                  icon={<Unplug />}
                  size="sm"
                  onClick={() =>
                    actions.revokeGrant.mutate(g.id, {
                      onSuccess: () => toast({ title: `${g.clientName} disconnected` }),
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
