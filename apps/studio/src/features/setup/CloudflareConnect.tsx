import {
  ArrowUpRight,
  Check,
  CircleAlert,
  ClipboardPaste,
  KeyRound,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type CloudflareCheck, useHosting, useHostingActions } from "../../api";
import type { Site } from "../../api/types";
import { Button, cx, Field, Input, Select, Spinner } from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { cloudflareTokenUrl, sealSecrets, TOKEN_RE } from "../settings/sealedBox";
import { can } from "../site-mgmt/manage-ui";

type Phase = "idle" | "saving" | "moving" | "confirming" | "done" | "rolled_back";

const PHASES: Array<{ id: Exclude<Phase, "idle" | "done" | "rolled_back">; label: string }> = [
  { id: "saving", label: "Saving your key safely" },
  { id: "moving", label: "Publishing your site to Cloudflare" },
  { id: "confirming", label: "Checking your site answers there" },
];

/**
 * The "as close to one click as possible" Cloudflare move: make a free account, open Cloudflare's
 * token page with every permission already chosen, paste once. Studio checks the key, finds the
 * account and its workers.dev address, saves the key as a sealed secret only the site's
 * publishing can open, moves the site, and confirms it answers — the GitHub Pages version stays
 * live throughout and the Hub switches back by itself if Cloudflare fails.
 */
export function CloudflareConnect({ site, onDone }: { site: Site; onDone?: () => void }) {
  const hosting = useHosting(site.id, true, { pollWhileMoving: 3000 });
  const actions = useHostingActions(site.id);
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState<string | undefined>();
  const [check, setCheck] = useState<CloudflareCheck | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const checkedFor = useRef("");
  const info = hosting.data;
  const sw = info?.switching ?? null;
  const onCloudflare = info?.target === "cloudflare";
  const confirmed = onCloudflare && (!sw || sw.status === "done");
  const tokenOk = TOKEN_RE.test(token.trim());

  // Check the key as soon as a whole one is pasted (and again when the account changes).
  const runCheck = actions.check.mutate;
  useEffect(() => {
    const t = token.trim();
    const sig = `${t}|${accountId ?? ""}`;
    if (!TOKEN_RE.test(t) || checkedFor.current === sig) return;
    checkedFor.current = sig;
    setError(null);
    runCheck(
      { token: t, accountId },
      {
        onSuccess: (c) => setCheck(c),
        onError: (e) => setError(e.message),
      },
    );
  }, [token, accountId, runCheck]);

  // Follow the move to its end (the Hub confirms or rolls back as it's read).
  useEffect(() => {
    if (phase !== "confirming" || !sw) return;
    if (sw.status === "done") {
      setPhase("done");
      onDone?.();
    } else if (sw.status === "rolled_back" || sw.status === "failed") setPhase("rolled_back");
  }, [phase, sw, onDone]);

  if (hosting.isPending) return <Spinner size={16} label="Checking where your site is hosted" />;
  if (hosting.isError || !info)
    return (
      <p className="st-setup-error" role="alert">
        {hosting.error?.message ??
          "We couldn't check your hosting just now. Try again in a minute."}
      </p>
    );

  if (confirmed || phase === "done")
    return (
      <div className="st-setup-ok" role="status">
        <Check aria-hidden="true" />
        <div>
          <strong>Your site runs on your own Cloudflare account.</strong>{" "}
          {sw?.url ? (
            <>
              It's live at{" "}
              <a href={sw.url} target="_blank" rel="noreferrer">
                {displayUrl(sw.url)}
              </a>
              .
            </>
          ) : null}
        </div>
      </div>
    );

  if (!can(site, "owner"))
    return (
      <p className="st-setup-note">
        Only the site's owner can connect Cloudflare. Ask them to open Finish setting up — it takes
        them about 10 minutes.
      </p>
    );

  if (info.everLive === false)
    return (
      <p className="st-setup-note">
        This opens up once your site's first version is live — usually a minute or two after it's
        created. Your site is being published right now.
      </p>
    );

  const move = async () => {
    if (!check?.ok || !check.account) return;
    setError(null);
    const key = info.actionsPublicKey;
    if (!key) {
      setError("Your site isn't quite ready for this yet. Try again in a minute.");
      return;
    }
    try {
      setPhase("saving");
      const sealed = await sealSecrets(key, {
        CLOUDFLARE_API_TOKEN: token.trim(),
        CLOUDFLARE_ACCOUNT_ID: check.account.id,
      });
      await actions.putSecrets.mutateAsync(sealed);
      setToken("");
      setPhase("moving");
      await actions.switchTo.mutateAsync({
        target: "cloudflare",
        ...(check.workersUrl ? { url: check.workersUrl } : {}),
      });
      setPhase("confirming");
      void hosting.refetch();
    } catch (err) {
      setPhase("idle");
      setError((err as Error).message);
    }
  };

  const busy = phase === "saving" || phase === "moving" || phase === "confirming";
  if (busy || phase === "rolled_back")
    return (
      <div className="st-setup-move">
        <p className="st-setup-note">
          Your current site stays online the whole time. Visitors won't notice a thing.
        </p>
        <ol className="st-setup-progress" aria-live="polite">
          {PHASES.map((p, i) => {
            const at = PHASES.findIndex((x) => x.id === phase);
            const done = phase === "rolled_back" ? false : i < at;
            const active = p.id === phase;
            return (
              <li key={p.id} className={cx(done && "is-done", active && "is-active")}>
                <span className="st-setup-progress__mark" aria-hidden="true">
                  {done ? <Check /> : active ? <Spinner size={12} /> : null}
                </span>
                {p.label}
                {active && p.id === "moving" && (
                  <span className="st-setup-progress__hint">This takes two or three minutes.</span>
                )}
              </li>
            );
          })}
        </ol>
        {phase === "rolled_back" && (
          <div className="st-setup-error" role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              {sw?.error ??
                "Cloudflare couldn't publish your site, so it stayed where it was — nothing changed for your visitors."}
              <div className="st-setup-actions">
                <Button size="sm" onClick={() => setPhase("idle")}>
                  Try again
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );

  return (
    <div className="st-setup-cf">
      <ol className="st-setup-steps">
        <li>
          <h4>Make a free Cloudflare account</h4>
          <p>Cloudflare runs your checkout and sign-in. Its free plan is plenty for most sites.</p>
          <a
            className="st-btnlink"
            href="https://dash.cloudflare.com/sign-up"
            target="_blank"
            rel="noreferrer"
          >
            <UserPlus aria-hidden="true" /> Open Cloudflare sign-up{" "}
            <ArrowUpRight aria-hidden="true" />
          </a>
          <p className="st-setup-aside">Already have an account? Skip to the next step.</p>
        </li>
        <li>
          <h4>Create your key</h4>
          <p>
            This opens Cloudflare with everything filled in. Scroll down, click{" "}
            <em>Continue to summary</em>, then <em>Create token</em>, and copy what it shows.
          </p>
          <a
            className="st-btnlink"
            href={cloudflareTokenUrl(site.name)}
            target="_blank"
            rel="noreferrer"
          >
            <KeyRound aria-hidden="true" /> Open Cloudflare, ready to create{" "}
            <ArrowUpRight aria-hidden="true" />
          </a>
        </li>
        <li>
          <h4>Paste it here</h4>
          <Field
            label="Your Cloudflare key"
            hint="We check it once and lock it away for your site's publishing. OpenSpace never keeps it."
            error={
              token && !tokenOk ? "That doesn't look like a whole Cloudflare key yet." : undefined
            }
          >
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              prefix={<ClipboardPaste aria-hidden="true" />}
              placeholder="Paste the key Cloudflare showed you"
              onChange={(e) => {
                setToken(e.target.value);
                setCheck(null);
              }}
            />
          </Field>
          {actions.check.isPending && (
            <Spinner size={12} label="Checking your key with Cloudflare" />
          )}
          {check && check.accounts.length > 1 && (
            <Field label="Which Cloudflare account?">
              <Select
                value={accountId ?? check.account?.id ?? ""}
                onValueChange={(v) => setAccountId(v)}
                options={check.accounts.map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Choose an account"
              />
            </Field>
          )}
          {check?.ok && check.account && (
            <p className="st-setup-found" role="status">
              <Check aria-hidden="true" /> Found <strong>{check.account.name}</strong>. Your site
              will be at{" "}
              {check.workersUrl ? displayUrl(check.workersUrl) : "your Cloudflare address"}.
            </p>
          )}
          {check && check.problems.length > 0 && (
            <ul className="st-setup-problems" role="alert">
              {check.problems.map((p) => (
                <li key={p.code}>
                  <CircleAlert aria-hidden="true" />
                  <span>
                    {p.message}{" "}
                    {p.fixUrl && (
                      <a href={p.fixUrl} target="_blank" rel="noreferrer">
                        Open it in Cloudflare <ArrowUpRight aria-hidden="true" />
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {check && check.problems.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                checkedFor.current = "";
                setCheck(null);
                runCheck(
                  { token: token.trim(), accountId },
                  { onSuccess: setCheck, onError: (e) => setError(e.message) },
                );
              }}
            >
              Check again
            </Button>
          )}
        </li>
      </ol>
      {error && (
        <div className="st-setup-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <div>{error}</div>
        </div>
      )}
      <div className="st-setup-actions">
        <Button variant="primary" disabled={!check?.ok} onClick={() => void move()}>
          Move my site to Cloudflare
        </Button>
      </div>
      <p className="st-setup-private">
        <ShieldCheck aria-hidden="true" /> Your current site stays online until the new one is
        confirmed working. If anything goes wrong, it stays exactly where it is.
      </p>
    </div>
  );
}
