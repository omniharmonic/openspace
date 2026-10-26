import { Check, Copy, Link2, Plus, Terminal, Trash2, Unplug } from "lucide-react";
import { useState } from "react";
import { type McpToken, useMcpActions, useMcpGrants, useMcpTokens } from "../../api";
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

export const PLUGIN_COMMANDS = [
  "/plugin marketplace add omniharmonic/openspace",
  "/plugin install openspace",
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
          <i className="is-url">https://…/mcp/u/…</i>
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

function TokenRow({ token, onRevoke }: { token: McpToken; onRevoke: () => void }) {
  const [confirm, setConfirm] = useState(false);
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
      <CopyLine value={token.url} label="connection link" />
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
 * Connect your AI (PRD §4.4, FR-40): a personal connector link for Claude (or any MCP-capable
 * agent), step-by-step instructions, the Claude Code plugin, and the apps that have access.
 */
export function ConnectAiSettings({ site }: { site: Site }) {
  const tokens = useMcpTokens(site.id);
  const grants = useMcpGrants();
  const actions = useMcpActions(site.id);
  const [label, setLabel] = useState("Claude");
  const first = tokens.data?.[0];

  const create = () =>
    actions.createToken.mutate(label.trim() || "Claude", {
      onSuccess: (t) => {
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
              Personal to you. Anyone with it can ask to edit this site, so keep it private.
            </p>
          </div>
        </div>
        {tokens.isPending ? (
          <Spinner size={14} label="Loading" />
        ) : tokens.data && tokens.data.length > 0 ? (
          <ul className="st-tokens">
            {tokens.data.map((t) => (
              <TokenRow key={t.id} token={t} onRevoke={() => actions.revokeToken.mutate(t.id)} />
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
              label: "Claude",
              content: (
                <ol className="st-steps st-steps--sketch">
                  <li className={first ? "is-done" : undefined}>
                    <div>
                      <strong>Make your link</strong> above and copy it.
                    </div>
                  </li>
                  <li>
                    <div>
                      In Claude, open <strong>Settings → Connectors</strong> and choose{" "}
                      <strong>Add custom connector</strong>.
                    </div>
                    <StepSketch kind="settings" />
                  </li>
                  <li>
                    <div>
                      Name it <strong>OpenSpace</strong>, paste your link as the URL, and click{" "}
                      <strong>Add</strong>.
                    </div>
                    <StepSketch kind="add" />
                  </li>
                  <li>
                    <div>
                      Sign in with GitHub when asked, tick <strong>{site.name}</strong>, and decide
                      whether Claude may publish. You can change this below at any time.
                    </div>
                    <StepSketch kind="allow" />
                  </li>
                  <li>
                    Ask Claude something like{" "}
                    <em>“Add an FAQ section to my home page about class sizes.”</em>
                  </li>
                </ol>
              ),
            },
            {
              value: "code",
              label: "Claude Code",
              content: (
                <div className="st-settings__stack">
                  <p className="st-muted-note">
                    <Terminal aria-hidden="true" /> In Claude Code, install the OpenSpace plugin. It
                    connects with your GitHub sign-in and knows how your site is put together.
                  </p>
                  {PLUGIN_COMMANDS.map((c) => (
                    <CopyLine key={c} value={c} label="command" />
                  ))}
                  {first && (
                    <>
                      <p className="st-muted-note">Or connect with your link directly:</p>
                      <CopyLine
                        value={`claude mcp add --transport http openspace ${first.url}`}
                        label="command"
                      />
                    </>
                  )}
                </div>
              ),
            },
            {
              value: "other",
              label: "Other apps",
              content: (
                <p className="st-muted-note">
                  Any app that supports MCP connectors over HTTP can use your link: add it as a
                  remote server and sign in when asked.
                </p>
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
