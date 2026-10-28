import {
  CheckCircle2,
  ExternalLink,
  MessageSquareText,
  PlugZap,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useId, useState } from "react";
import { useMcpGrants, useSession } from "../../api";
import type { AttentionGroup, ImportFidelity } from "../../api/import-types";
import { Button, cx, Spinner } from "../../ui";
import { ClaudeAppSteps, copy } from "../connect/ConnectSteps";
import { LetClaudeEdit, reaches } from "../connect/LetClaudeEdit";
import { claudeNewChatUrl, finishMovePrompt } from "../start/prompt";
import "../connect/ConnectAiPage.css";
import "../site-mgmt/manage.css";
import "./FinishWithClaude.css";

/** At or above this match (and nothing listed as different), the move speaks for itself. */
export const CLOSE_ENOUGH = 90;

/** Pages that still differ, in plain words: "Home on a phone: image placement". */
export function stillDiffers(fidelity: ImportFidelity | null | undefined): string[] {
  return (fidelity?.pages ?? [])
    .filter((p) => p.differs?.length)
    .map(
      (p) =>
        `${p.path === "/" ? "Home" : p.path} on a ${p.device === "phone" ? "phone" : "computer"}: ${(p.differs ?? []).join(", ").toLowerCase()}`,
    );
}

/**
 * Should a finished move invite Claude to take it further? When the match is below ~90, or the
 * move listed differences or things that didn't come across.
 */
export function wantsClaude(view: {
  fidelity?: ImportFidelity | null;
  attention?: readonly AttentionGroup[];
}): boolean {
  const f = view.fidelity;
  if (f && f.score < CLOSE_ENOUGH) return true;
  if (stillDiffers(f).length) return true;
  return (view.attention ?? []).some((g) => g.items.length > 0);
}

/**
 * "Want it closer? Claude can finish the job" — the honest next step after an automatic move:
 * connect Claude once (if needed), let it work on this site (the person's own "allow", never a
 * self-grant), then open Claude with a ready message naming the old address and the new site.
 */
export function FinishWithClaude({
  site,
  source,
  fidelity,
  startOpen = false,
  heading = true,
}: {
  site: { id: string; name: string };
  /** The old site's address (or GitHub repository), when known. */
  source?: string | null;
  fidelity?: ImportFidelity | null;
  /** Show the steps straight away (inside a dialog that was opened for this). */
  startOpen?: boolean;
  /** Show the section's own heading (off inside a dialog that already has one). */
  heading?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const titleId = useId();
  const score = fidelity?.score;
  const differs = stillDiffers(fidelity);
  const prompt = finishMovePrompt(site, source, score);

  return (
    <section
      className="st-moveclaude"
      aria-labelledby={heading ? titleId : undefined}
      aria-label={heading ? undefined : "Improve it with Claude"}
    >
      {heading && (
        <h2 id={titleId} className="st-moveclaude__title">
          <Sparkles aria-hidden="true" /> Want it closer? Claude can finish the job
        </h2>
      )}
      <p className="st-moveclaude__lede">
        The automatic move brings across everything it recognises
        {typeof score === "number" ? ` — this one came out at ${score}/100` : ""}. Claude can look
        at your old site and the new one side by side, page by page, and rebuild what didn’t come
        across: custom sections, animations, missing pieces.
      </p>
      <p className="st-moveclaude__lede">
        Your site stays editable here — every word and picture — and Claude asks you before anything
        goes live.
      </p>
      {differs.length > 0 && (
        <div className="st-moveclaude__start">
          <p>Where Claude would start:</p>
          <ul>
            {differs.slice(0, 4).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {open ? (
        <ol className="st-moveclaude__steps">
          <ConnectStep site={site} />
          <li className="st-moveclaude__step">
            <h3 className="st-moveclaude__h">
              <MessageSquareText aria-hidden="true" /> Open Claude with a ready message
            </h3>
            <pre className="st-moveclaude__prompt">{prompt}</pre>
            <div className="st-moveclaude__actions">
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
            <p className="st-moveclaude__note">
              Using the Claude desktop app? Copy the message and paste it into a new chat.
            </p>
          </li>
        </ol>
      ) : (
        <div className="st-moveclaude__actions">
          <Button variant="primary" icon={<Wand2 />} onClick={() => setOpen(true)}>
            Improve it with Claude
          </Button>
        </div>
      )}
    </section>
  );
}

/** Step 1: connected and allowed on this site, allowed elsewhere only, or not connected yet. */
function ConnectStep({ site }: { site: { id: string; name: string } }) {
  const session = useSession();
  const signedIn = Boolean(session.data?.user);
  const grants = useMcpGrants(signedIn);
  const apps = grants.data ?? [];
  const ready = apps.find((g) => reaches(g, site.id));
  const checking = signedIn && grants.isPending;

  return (
    <li className={cx("st-moveclaude__step", ready && "is-done")}>
      {checking ? (
        <Spinner size={14} label="Checking your Claude connection" />
      ) : ready ? (
        <h3 className="st-moveclaude__h">
          <CheckCircle2 aria-hidden="true" /> {ready.clientName} can work on {site.name}
        </h3>
      ) : apps.length ? (
        <>
          <h3 className="st-moveclaude__h">
            <PlugZap aria-hidden="true" /> Let Claude work on {site.name}
          </h3>
          <p className="st-moveclaude__note">
            Claude is connected, but this site is new to it. One click — no need to reconnect.
          </p>
          <LetClaudeEdit site={site} />
        </>
      ) : (
        <>
          <h3 className="st-moveclaude__h">
            <PlugZap aria-hidden="true" /> Connect OpenSpace to Claude (once)
          </h3>
          <p className="st-moveclaude__note">
            About two minutes, nothing to install. Works on claude.ai and in the Claude desktop app.
          </p>
          <ClaudeAppSteps siteName={site.name} />
        </>
      )}
    </li>
  );
}
