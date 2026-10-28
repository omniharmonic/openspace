import {
  CheckCircle2,
  ExternalLink,
  MessageSquareText,
  PlugZap,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useMcpActions, useMcpGrants, useSession } from "../../api";
import type { McpGrant } from "../../api/manage-types";
import { Wordmark } from "../../app/Wordmark";
import { Button, cx, Spinner, toast } from "../../ui";
import { ClaudeAppSteps, ClaudeCodeSteps, copy, DOCS_URL } from "../connect/ConnectSteps";
import { claudeNewChatUrl, startInClaudePrompt } from "./prompt";
import "./Start.css";

/** Can this connection make the person's new site? */
const canStart = (g: McpGrant) => Boolean(g.create);

/**
 * `/start` — "Start with Claude" happens in Claude: connect OpenSpace to Claude once (skipped when
 * it already is), then open Claude with a ready first message. Claude asks about the site,
 * proposes a direction, designs it, publishes it through OpenSpace and hands back the edit link.
 * The quick form stays one link away (`/start/form`).
 */
export function StartInClaude() {
  const session = useSession();
  const user = session.data?.user;
  const grants = useMcpGrants(Boolean(user));
  const actions = useMcpActions("");
  const [idea, setIdea] = useState("");
  const [showCode, setShowCode] = useState(false);
  const prompt = startInClaudePrompt(idea);
  const apps = grants.data ?? [];
  const ready = apps.find(canStart);
  const connectedOnly = !ready ? apps[0] : undefined;
  const checking = Boolean(user) && grants.isPending;

  return (
    <div className="st-start">
      <header className="st-start__top">
        <Wordmark to="/sites" />
      </header>
      <main className="st-start__main st-claude-start">
        <section className="st-claude-start__intro">
          <span className="st-claude-start__mark" aria-hidden="true">
            <Sparkles />
          </span>
          <h1 className="st-start__title">Start with Claude</h1>
          <p className="st-start__lede">
            Make your website in a conversation. Claude asks you a few questions — what it’s for,
            who it’s for, how it should feel — designs it with you, and puts it online with
            OpenSpace. You get the link to your live site and a link to edit it here, any time.
          </p>
        </section>

        <ol className="st-claude-start__steps">
          <li className={cx("st-claude-start__step", ready && "is-done")}>
            <h2 className="st-claude-start__h">
              {ready ? (
                <>
                  <CheckCircle2 aria-hidden="true" /> {ready.clientName} is connected
                </>
              ) : (
                <>
                  <PlugZap aria-hidden="true" /> Connect OpenSpace to Claude (once)
                </>
              )}
            </h2>
            {checking ? (
              <Spinner size={14} label="Checking your connection" />
            ) : ready ? (
              <p className="st-claude-start__note">
                It can create your new site{ready.allSites ? " and edit all your sites" : ""}.
                Nothing to set up — go straight to the next step.
              </p>
            ) : connectedOnly ? (
              <div className="st-claude-start__note">
                <p>
                  {connectedOnly.clientName} is connected, but it isn’t allowed to make new sites
                  yet.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  loading={actions.setScope.isPending}
                  onClick={() =>
                    actions.setScope.mutate(
                      { id: connectedOnly.id, create: true },
                      {
                        onSuccess: () =>
                          toast({
                            tone: "success",
                            title: `${connectedOnly.clientName} can make your new site`,
                          }),
                      },
                    )
                  }
                >
                  Let {connectedOnly.clientName} create my site
                </Button>
              </div>
            ) : (
              <>
                <p className="st-claude-start__note">
                  About two minutes, nothing to install. Works on claude.ai and in the Claude
                  desktop app.
                  {!user && " Already connected? Skip to step 2."}
                </p>
                <ClaudeAppSteps />
                <button
                  type="button"
                  className="st-claude-start__alt"
                  aria-expanded={showCode}
                  onClick={() => setShowCode((v) => !v)}
                >
                  <Terminal aria-hidden="true" /> Using Claude Code instead?
                </button>
                {showCode && <ClaudeCodeSteps />}
              </>
            )}
          </li>

          <li className="st-claude-start__step">
            <h2 className="st-claude-start__h">
              <MessageSquareText aria-hidden="true" /> Open Claude and say hello
            </h2>
            <label className="st-claude-start__idea">
              <span>In a few words, what’s the site for? (optional)</span>
              <input
                type="text"
                value={idea}
                maxLength={120}
                placeholder="e.g. my pottery studio in Leith"
                onChange={(e) => setIdea(e.target.value)}
              />
            </label>
            <pre className="st-start__prompt">{prompt}</pre>
            <div className="st-start__actions">
              <a
                className="st-button st-button--primary"
                href={claudeNewChatUrl(prompt)}
                target="_blank"
                rel="noreferrer"
              >
                Open Claude with this message <ExternalLink size={12} aria-hidden="true" />
              </a>
              <Button icon={<MessageSquareText />} onClick={() => void copy(prompt, "Message")}>
                Copy the message
              </Button>
            </div>
            <p className="st-claude-start__note">
              Using the Claude desktop app? Copy the message and paste it into a new chat.
            </p>
          </li>

          <li className="st-claude-start__step">
            <h2 className="st-claude-start__h">
              <Sparkles aria-hidden="true" /> What happens next
            </h2>
            <ul className="st-claude-start__next">
              <li>Claude asks a few questions, one or two at a time.</li>
              <li>It suggests a direction — colours, type, the pages — and checks it with you.</li>
              <li>
                It designs your site (not a template) and puts it online on free hosting. The first
                version takes about a minute to appear.
              </li>
              <li>
                It gives you two links: your live site, and the editor here — where you can change
                any word or photo yourself. Claude can keep refining it with you.
              </li>
            </ul>
          </li>
        </ol>

        <p className="st-start__fine">
          <Link to="/start/form">Prefer a quick form instead?</Link> ·{" "}
          <a href={`${DOCS_URL}/guides/start-with-claude/`} target="_blank" rel="noreferrer">
            How Start with Claude works
          </a>
        </p>
      </main>
    </div>
  );
}
