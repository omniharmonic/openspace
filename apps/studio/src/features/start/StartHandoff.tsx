import {
  CheckCircle2,
  Download,
  ExternalLink,
  MessageSquareText,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useSite } from "../../api";
import { needsGitHub } from "../../api/types";
import { LoadError } from "../../app/Connection";
import { Wordmark } from "../../app/Wordmark";
import { Button, cx, Spinner } from "../../ui";
import { ClaudeAppSteps, CopyLine, copy, DOCS_URL, PLUGIN_COMMANDS } from "../connect/ConnectSteps";
import { ConnectGitHub } from "../onboarding/ConnectGitHub";
import { type Brief, claudeNewChatUrl, DESIGN_SKILL, designPrompt } from "./prompt";
import "./Start.css";

interface HandoffState {
  startedFrom?: { kind: "template" | "html"; template?: string; look?: string; why?: string };
  brief?: Brief;
}

/**
 * After "Start with Claude": the site going live (wow first — a good default is online in a
 * minute or two whether or not Claude is connected yet), then the hand-off to Claude to design
 * it properly: the Claude app (recommended: connector + skill + a ready-made message) or Claude
 * Code.
 */
export function StartHandoff() {
  const { siteId } = useParams();
  const location = useLocation();
  const state = (location.state ?? {}) as HandoffState;
  const site = useSite(siteId, { pollOnError: true });
  const [tab, setTab] = useState<"app" | "code">("app");
  const navigate = useNavigate();

  if (site.isPending)
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading your site" />
      </div>
    );
  if (site.isError || !site.data)
    return (
      <div className="st-center">
        <LoadError
          title="Your site didn’t load"
          error={site.error}
          onRetry={() => void site.refetch()}
        />
      </div>
    );
  const s = site.data;
  if (needsGitHub(s)) return <ConnectGitHub site={s} isOwner={(s.role ?? "owner") === "owner"} />;
  const live = s.status === "live";
  const prompt = designPrompt({ id: s.id, name: s.name }, state.brief ?? {});
  const from = state.startedFrom;

  return (
    <div className="st-start">
      <header className="st-start__top">
        <Wordmark to="/sites" />
      </header>
      <main className="st-start__main st-start__main--handoff">
        <section className="st-start__status" aria-live="polite">
          <span className={cx("st-start__icon", live && "is-live")} aria-hidden="true">
            {live ? <CheckCircle2 /> : <Spinner size={18} />}
          </span>
          <h1 className="st-start__title">
            {live ? `${s.name} is live` : `Putting ${s.name} online…`}
          </h1>
          <p className="st-start__lede">
            {from?.kind === "html"
              ? "Your page is now a real site: every section keeps its design, and every word, picture and link can be changed in the editor."
              : from?.template
                ? `We started from the ${from.template} design in your colours and fonts — ${from.why ?? "a good fit"}. It’s a starting point: Claude makes it yours next.`
                : "A good starting design is going online now. Claude makes it yours next."}
          </p>
          {live && s.url && (
            <p className="st-start__note">
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.url.replace(/^https?:\/\//, "")} <ExternalLink size={12} aria-hidden="true" />
              </a>
            </p>
          )}
          <div className="st-start__actions">
            <Button
              variant={live ? "primary" : "secondary"}
              icon={<PenLine />}
              onClick={() => navigate(`/sites/${s.id}?welcome=1`)}
            >
              Open it in the editor
            </Button>
          </div>
        </section>

        <section className="st-start__handoff" aria-labelledby="handoff-title">
          <h2 id="handoff-title" className="st-start__subtitle">
            <Sparkles aria-hidden="true" /> Now let Claude design it with you
          </h2>
          <p className="st-start__lede">
            Claude reads what you told us and your brand, then works through the design with you —
            the feel, the colours and type, each page — showing you the result as it goes. Your site
            is already live, so there’s no rush.
          </p>
          <div className="st-start__tabs" role="tablist" aria-label="Where you use Claude">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "app"}
              className={cx("st-start__tab", tab === "app" && "is-on")}
              onClick={() => setTab("app")}
            >
              Claude app <span className="st-start__badge">Recommended</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "code"}
              className={cx("st-start__tab", tab === "code" && "is-on")}
              onClick={() => setTab("code")}
            >
              Claude Code
            </button>
          </div>
          {tab === "app" ? (
            <ol className="st-start__plan">
              <li>
                <h3>Connect OpenSpace to Claude (once)</h3>
                <ClaudeAppSteps siteName={s.name} />
              </li>
              <li>
                <h3>Add the design skill</h3>
                <p>
                  In Claude, open <strong>Settings → Capabilities → Skills</strong>, choose{" "}
                  <strong>Upload skill</strong> and pick this file.
                </p>
                <a
                  className="st-start__download"
                  href={`${DOCS_URL}/skills/${DESIGN_SKILL}.zip`}
                  download
                >
                  <Download aria-hidden="true" /> Design-from-scratch skill (.zip)
                </a>
              </li>
              <li>
                <h3>Send Claude this message</h3>
                <pre className="st-start__prompt">{prompt}</pre>
                <div className="st-start__actions">
                  <Button icon={<MessageSquareText />} onClick={() => void copy(prompt, "Message")}>
                    Copy the message
                  </Button>
                  <a
                    className="st-start__open"
                    href={claudeNewChatUrl(prompt)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Claude with it <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
              </li>
            </ol>
          ) : (
            <ol className="st-start__plan">
              <li>
                <h3>Add the OpenSpace plugin to Claude Code (once)</h3>
                {PLUGIN_COMMANDS.map((c) => (
                  <CopyLine key={c} value={c} label="command" />
                ))}
              </li>
              <li>
                <h3>Ask Claude</h3>
                <pre className="st-start__prompt">{prompt}</pre>
                <Button icon={<MessageSquareText />} onClick={() => void copy(prompt, "Message")}>
                  Copy the message
                </Button>
              </li>
            </ol>
          )}
          <p className="st-start__fine">
            Not ready for Claude yet? That’s fine — your site stays live as it is, and you can edit
            it yourself any time. <Link to="/connect">Connect Claude later</Link> ·{" "}
            <a href={`${DOCS_URL}/guides/start-with-claude/`} target="_blank" rel="noreferrer">
              How Start with Claude works
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
