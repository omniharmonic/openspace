import { Check, Copy, Terminal, Unplug } from "lucide-react";
import { useState } from "react";
import { hubMcpUrl, useMcpActions, useMcpGrants } from "../../api";
import { Badge, Button, EmptyState, IconButton, Spinner, Toggle, toast } from "../../ui";

export async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ tone: "success", title: `${what} copied` });
  } catch {
    toast({ tone: "danger", title: "Couldn’t copy", description: text });
  }
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

/**
 * The OpenSpace plugin for Claude Code (skills and slash commands such as a design check).
 * It is NOT in Claude's built-in plugin list: it comes from this project's own "marketplace"
 * (plugin catalog), added once. Typed inside Claude Code:
 */
export const PLUGIN_COMMANDS = [
  "/plugin marketplace add omniharmonic/openspace",
  "/plugin install openspace@openspace",
] as const;

/**
 * Skills for claude.ai and Claude Desktop (Customize → Skills → upload the .zip), built by the
 * docs site (apps/docs/scripts/skills.mjs). No installs: they use this connector only.
 */
export const DOCS_URL = "https://docs.openspace.host";
export const CLAUDE_APP_SKILLS = [
  {
    name: "openspace-design-from-scratch",
    what: "design a new site with you, from your idea and brand",
  },
  { name: "openspace-migrate", what: "move a site from Squarespace, GitHub Pages or anywhere" },
  { name: "openspace-web-design", what: "design pages, checking screenshots as it goes" },
  { name: "openspace-content", what: "blog posts, events and products" },
  { name: "openspace-site-setup", what: "publishing and your domain" },
] as const;

/** The same from a terminal (outside Claude Code). */
export const PLUGIN_CLI_COMMANDS = [
  "claude plugin marketplace add omniharmonic/openspace",
  "claude plugin install openspace@openspace",
] as const;

export function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A drawn (unbranded) sketch of the step, standing in for a screenshot. */
export function StepSketch({ kind }: { kind: "settings" | "add" | "allow" }) {
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
          <b>Allow Claude</b>
          <i className="is-check">☑ Your site</i>
          <i className="is-check">☐ Allow publishing</i>
          <em>Allow</em>
        </span>
      )}
    </span>
  );
}

/**
 * The recommended path, nothing to install: claude.ai or the Claude Desktop app → Settings →
 * Connectors → Add custom connector → the Hub's `/mcp` URL.
 */
export function ClaudeAppSteps({ siteName }: { siteName?: string }) {
  const mcpUrl = hubMcpUrl();
  return (
    <ol className="st-steps st-steps--sketch">
      <li>
        <div>
          Open Claude — on <strong>claude.ai</strong> in your browser or in the{" "}
          <strong>Claude Desktop</strong> app. Go to <strong>Settings → Connectors</strong> and
          choose <strong>Add custom connector</strong>.
        </div>
        <StepSketch kind="settings" />
      </li>
      <li>
        <div>
          Name it <strong>OpenSpace</strong>, paste this address, and choose <strong>Add</strong>:
          <CopyLine value={mcpUrl} label="connector address" />
        </div>
        <StepSketch kind="add" />
      </li>
      <li>
        <div>
          Choose <strong>Connect</strong>, sign in with GitHub, then{" "}
          {siteName ? (
            <>
              tick <strong>{siteName}</strong>
            </>
          ) : (
            <>
              keep <strong>Create new sites</strong> ticked (and tick any sites you already have)
            </>
          )}{" "}
          and choose <strong>Allow</strong>. Publishing stays off unless you turn it on.
        </div>
        <StepSketch kind="allow" />
      </li>
      <li>
        Ask Claude, for example:{" "}
        {siteName ? (
          <em>“Add an FAQ section to my home page about class sizes.”</em>
        ) : (
          <em>
            “Make me a website for my yoga studio” or “Move my Squarespace site to OpenSpace.”
          </em>
        )}
      </li>
    </ol>
  );
}

/** For people who use Claude Code (a terminal app): the same connection, plus the plugin. */
export function ClaudeCodeSteps({ siteName }: { siteName?: string }) {
  const command = `claude mcp add --transport http openspace ${hubMcpUrl()}`;
  return (
    <div className="st-settings__stack">
      <ol className="st-steps">
        <li>
          <div>
            <Terminal aria-hidden="true" /> In a terminal, add OpenSpace to Claude Code:
          </div>
          <CopyLine value={command} label="command" />
        </li>
        <li>
          In Claude Code, type <code className="st-code">/mcp</code>, pick{" "}
          <strong>openspace</strong> and choose <strong>Authenticate</strong>.
        </li>
        <li>
          Sign in with GitHub,{" "}
          {siteName ? (
            <>
              tick <strong>{siteName}</strong>
            </>
          ) : (
            <>
              keep <strong>Create new sites</strong> ticked
            </>
          )}{" "}
          and decide whether Claude may publish (off unless you choose it).
        </li>
      </ol>
      <PluginSteps />
    </div>
  );
}

/** Explicit plugin install: it isn't in Claude's built-in plugin directory. */
export function PluginSteps() {
  return (
    <div className="st-settings__stack">
      <p className="st-muted-note">
        <strong>Optional: the OpenSpace plugin</strong> adds skills and shortcuts (design check, new
        page, publish). It is <strong>not</strong> in Claude’s built-in plugin list, so you add
        OpenSpace’s own plugin catalog first. Type these in Claude Code, one at a time:
      </p>
      {PLUGIN_COMMANDS.map((c) => (
        <CopyLine key={c} value={c} label="command" />
      ))}
      <p className="st-muted-note">
        Then quit and reopen Claude Code. From a terminal instead, run:
      </p>
      {PLUGIN_CLI_COMMANDS.map((c) => (
        <CopyLine key={c} value={c} label="command" />
      ))}
    </div>
  );
}

/** AI apps connected to this account (OAuth), with publish toggles and disconnect. */
export function AppsWithAccess() {
  const grants = useMcpGrants();
  const actions = useMcpActions("");
  if (grants.isPending) return <Spinner size={14} label="Loading" />;
  if (!grants.data?.length)
    return (
      <EmptyState
        size="sm"
        icon={<Unplug />}
        title="No apps connected yet"
        description="Once you connect Claude, it shows up here."
      />
    );
  return (
    <ul className="st-grants">
      {grants.data.map((g) => (
        <li key={g.id} className="st-grant">
          <div className="st-grant__main">
            <strong>{g.clientName}</strong>
            <span className="st-muted-note">
              {g.sites.length
                ? g.sites.map((s) => s.name).join(", ")
                : g.create
                  ? "Can create new sites"
                  : "Sites you choose"}{" "}
              · last used {when(g.lastUsedAt)}
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
  );
}

/** Optional skills for the Claude app (uploaded .zip files; nothing to install). */
export function ClaudeAppSkills() {
  return (
    <section className="st-settings__stack" aria-labelledby="ai-skills">
      <h4 id="ai-skills" className="st-card__title">
        Add the OpenSpace skills
      </h4>
      <p className="st-muted-note">
        Skills teach Claude how to do these jobs well. Nothing to install: download a file below
        (don’t unzip it), then in Claude open <strong>Customize → Skills</strong>, choose{" "}
        <strong>Upload a skill</strong>, pick the file and turn the skill on.
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
        <a href={`${DOCS_URL}/connect-your-ai/claude-app/`} target="_blank" rel="noreferrer">
          Step-by-step guide and example requests
        </a>
      </p>
    </section>
  );
}
