import { Bot, Sparkles, Terminal } from "lucide-react";
import { useSession } from "../../api";
import { AppHeader } from "../../app/AppHeader";
import "../settings/settings.css";
import "../site-mgmt/manage.css";
import { AppsWithAccess, ClaudeAppSteps, ClaudeCodeSteps } from "./ConnectSteps";
import "./ConnectAiPage.css";

/**
 * `/connect` — Connect your AI, for the whole account (no site needed first). The Claude app
 * (claude.ai / Claude Desktop) comes first: nothing to install. Claude Code is for people who
 * already use a terminal.
 */
export function ConnectAiPage() {
  const session = useSession();
  const user = session.data?.user;
  return (
    <div className="st-page">
      <AppHeader />
      <main className="st-connect">
        <h1 className="st-connect__title">Connect your AI</h1>
        <p className="st-connect__lede">
          Let Claude build and edit your website with you — in plain words, like “add a page about
          my workshops”. You don’t need a site first: Claude can make one from a template or move
          the site you already have. You see every change in OpenSpace, and nothing goes live until
          you say so.
        </p>

        <section className="st-card" aria-labelledby="connect-app">
          <div className="st-card__head">
            <div>
              <h2 id="connect-app" className="st-card__title">
                <Sparkles aria-hidden="true" /> Recommended: the Claude app
              </h2>
              <p className="st-card__desc">
                Works in your browser at claude.ai or in Claude Desktop. Nothing to download or
                install — about two minutes.
              </p>
            </div>
          </div>
          <ClaudeAppSteps />
        </section>

        <section className="st-card" aria-labelledby="connect-code">
          <div className="st-card__head">
            <div>
              <h2 id="connect-code" className="st-card__title">
                <Terminal aria-hidden="true" /> For Claude Code users
              </h2>
              <p className="st-card__desc">
                Claude Code runs in a terminal and suits people comfortable with developer tools. If
                that’s not you, the Claude app above does everything you need.
              </p>
            </div>
          </div>
          <ClaudeCodeSteps />
        </section>

        {user && (
          <section className="st-card" aria-labelledby="connect-apps">
            <h2 id="connect-apps" className="st-card__title">
              <Bot aria-hidden="true" /> Apps with access
            </h2>
            <AppsWithAccess />
          </section>
        )}
      </main>
    </div>
  );
}
