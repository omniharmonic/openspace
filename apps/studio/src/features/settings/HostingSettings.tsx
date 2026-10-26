import {
  ArrowUpRight,
  Check,
  Cloud,
  KeyRound,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { useHosting, useHostingActions } from "../../api";
import type { Site } from "../../api/types";
import { Badge, Button, cx, Dialog, Field, Input, Spinner, toast } from "../../ui";
import { displayUrl } from "../onboarding/BuildingProgress";
import { ACCOUNT_ID_RE, cloudflareTokenUrl, sealSecrets, TOKEN_RE } from "./sealedBox";

type Stage = "idle" | "sealing" | "saving" | "switching" | "done";

const STAGE_LABEL: Record<Stage, string> = {
  idle: "",
  sealing: "Locking your token in this browser…",
  saving: "Saving it to your site's secrets…",
  switching: "Moving your site to Cloudflare…",
  done: "Done",
};

/**
 * Hosting: GitHub Pages (default) ↔ Cloudflare (stores, member areas, password pages). The
 * Cloudflare token is sealed in the browser with the site's own key and saved as a secret only
 * the site's publishing can read; OpenSpace never stores it (arch §7.2).
 */
export function HostingSettings({ site }: { site: Site }) {
  const hosting = useHosting(site.id);
  const actions = useHostingActions(site.id);
  const [token, setToken] = useState("");
  const [account, setAccount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);

  if (hosting.isPending) return <Spinner size={16} label="Loading hosting" />;
  if (hosting.isError || !hosting.data)
    return <p className="st-media-warn">{hosting.error?.message ?? "Couldn't load hosting."}</p>;
  const info = hosting.data;
  const onCloudflare = info.target === "cloudflare";
  const tokenOk = TOKEN_RE.test(token.trim());
  const accountOk = ACCOUNT_ID_RE.test(account.trim().toLowerCase());

  const connect = async () => {
    setError(null);
    const key = info.actionsPublicKey;
    if (!key) {
      setError("Your site's secret key isn't available yet. Try again in a minute.");
      return;
    }
    try {
      setStage("sealing");
      const sealed = await sealSecrets(key, {
        CLOUDFLARE_API_TOKEN: token.trim(),
        CLOUDFLARE_ACCOUNT_ID: account.trim().toLowerCase(),
      });
      setStage("saving");
      await actions.putSecrets.mutateAsync(sealed);
      setToken("");
      setStage("switching");
      await actions.switchTo.mutateAsync("cloudflare");
      setStage("done");
      toast({
        tone: "celebrate",
        title: "Your site is moving to Cloudflare",
        description: "It's live there after the next publish.",
      });
    } catch (err) {
      setStage("idle");
      setError((err as Error).message);
    }
  };

  return (
    <div className="st-settings__stack">
      <section className="st-card" aria-labelledby="host-now">
        <div className="st-card__head">
          <div>
            <h3 id="host-now" className="st-card__title">
              {onCloudflare ? "Cloudflare" : "GitHub Pages"}
            </h3>
            <p className="st-card__desc">
              {onCloudflare
                ? "Your site runs in your own Cloudflare account, on its free plan. Stores, member areas and password pages work here."
                : "Free and fast, straight from your GitHub account. Great for most sites."}
            </p>
          </div>
          <Badge tone="live" dot>
            In use
          </Badge>
        </div>
        <a className="st-home__link" href={info.url} target="_blank" rel="noreferrer">
          {displayUrl(info.url)} <ArrowUpRight aria-hidden="true" />
        </a>
      </section>

      {!onCloudflare && stage !== "done" && (
        <section className="st-card" aria-labelledby="host-up">
          <div className="st-card__head">
            <div>
              <h3 id="host-up" className="st-card__title">
                <Cloud aria-hidden="true" className="st-inline-icon" /> Switch to Cloudflare
              </h3>
              <p className="st-card__desc">
                Needed for a store, member area or password-protected pages. Cloudflare's free plan
                covers about 100,000 visits a day. Your site stays exactly the same.
              </p>
            </div>
          </div>
          <ol className="st-steps">
            <li>
              <strong>Create a free Cloudflare account</strong> if you don't have one.{" "}
              <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">
                Sign up <ArrowUpRight aria-hidden="true" className="st-inline-icon" />
              </a>
            </li>
            <li>
              <strong>Create an access token.</strong> This opens Cloudflare with the right
              permissions already chosen; scroll down, click <em>Continue to summary</em>, then{" "}
              <em>Create token</em>, and copy it.
              <div className="st-row-actions st-row-actions--start">
                <a
                  className="st-btnlink"
                  href={cloudflareTokenUrl(site.name)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <KeyRound aria-hidden="true" /> Create token on Cloudflare{" "}
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </div>
            </li>
            <li>
              <strong>Paste it here</strong>, with your account ID (on the right side of your
              Cloudflare dashboard home).
              <form
                className="st-host-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tokenOk && accountOk) void connect();
                }}
              >
                <Field
                  label="Access token"
                  error={
                    token && !tokenOk ? "That doesn't look like a Cloudflare token." : undefined
                  }
                >
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    prefix={<Lock aria-hidden="true" />}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </Field>
                <Field
                  label="Account ID"
                  error={
                    account && !accountOk ? "Account IDs are 32 letters and numbers." : undefined
                  }
                >
                  <Input
                    value={account}
                    spellCheck={false}
                    autoCapitalize="none"
                    placeholder="e.g. 0123456789abcdef0123456789abcdef"
                    onChange={(e) => setAccount(e.target.value)}
                  />
                </Field>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!tokenOk || !accountOk || stage !== "idle"}
                  loading={stage !== "idle"}
                >
                  Connect Cloudflare
                </Button>
              </form>
              {stage !== "idle" && (
                <ul className="st-progress" aria-live="polite">
                  {(["sealing", "saving", "switching"] as const).map((s, i) => {
                    const order = ["sealing", "saving", "switching", "done"];
                    const done = order.indexOf(stage) > i;
                    return (
                      <li key={s} className={cx(done && "is-done", stage === s && "is-active")}>
                        {done ? <Check aria-hidden="true" /> : <Spinner size={12} />}
                        {STAGE_LABEL[s]}
                      </li>
                    );
                  })}
                </ul>
              )}
              {error && (
                <div className="st-callout st-callout--danger" role="alert">
                  <TriangleAlert aria-hidden="true" />
                  <div>{error}</div>
                </div>
              )}
            </li>
          </ol>
          <div className="st-callout st-callout--accent" role="note">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>Your token stays private.</strong> It's locked in this browser with your
              site's own key before it leaves, and only your site's publishing can unlock it.
              OpenSpace never sees or stores it.
            </div>
          </div>
        </section>
      )}

      {(onCloudflare || stage === "done") && (
        <section className="st-card" aria-labelledby="host-next">
          <h3 id="host-next" className="st-card__title">
            {stage === "done" ? "Almost there" : "Your domain"}
          </h3>
          <p className="st-card__desc">
            {site.domain
              ? `Move ${site.domain} to Cloudflare: add it to your Cloudflare account, then point it at your site. Visitors keep reaching the current version until you do.`
              : "When you add a domain, connect it in your Cloudflare dashboard."}
          </p>
          {onCloudflare && (
            <div className="st-row-actions st-row-actions--start">
              <Button variant="ghost" size="sm" onClick={() => setConfirmBack(true)}>
                Switch back to GitHub Pages
              </Button>
            </div>
          )}
        </section>
      )}

      <Dialog
        open={confirmBack}
        onOpenChange={setConfirmBack}
        title="Switch back to GitHub Pages?"
        description="Your store, member area and password pages stop working on the free GitHub Pages hosting. Everything else stays the same."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBack(false)}>
              Stay on Cloudflare
            </Button>
            <Button
              variant="danger"
              loading={actions.switchTo.isPending}
              onClick={() =>
                actions.switchTo.mutate("github-pages", {
                  onSuccess: () => {
                    setConfirmBack(false);
                    setStage("idle");
                    toast({ title: "Switching back to GitHub Pages" });
                  },
                  onError: (err) =>
                    toast({ tone: "danger", title: "Couldn’t switch", description: err.message }),
                })
              }
            >
              Switch back
            </Button>
          </>
        }
      />
    </div>
  );
}
