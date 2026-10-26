import { type FormEvent, useState } from "react";
import { useDevLogin, useGitHubSignIn, useSession } from "../../api";
import type { GitHubSignInParams, User } from "../../api/types";
import { GitHubIcon } from "../../app/icons";
import { Button, Field, Input } from "../../ui";
import "./SignInPanel.css";

export interface SignInPanelProps {
  /** Passed to the Hub so GitHub sign-in returns to the same step. */
  github: GitHubSignInParams;
  /** Called once a user is signed in without leaving the page (dev sign-in, mock GitHub). */
  onSignedIn: (user: User) => void;
  /** Called right before the browser leaves for GitHub. */
  beforeRedirect?: () => void;
}

/** GitHub sign-in with the plain-language explainer, plus the local dev sign-in when the Hub offers it. */
export function SignInPanel({ github, onSignedIn, beforeRedirect }: SignInPanelProps) {
  const session = useSession();
  const gh = useGitHubSignIn();
  const dev = useDevLogin();
  const [devName, setDevName] = useState("");
  const devAvailable = session.data?.auth.dev ?? false;

  const startGitHub = async () => {
    beforeRedirect?.();
    const user = await gh.mutateAsync(github);
    if (user) onSignedIn(user);
  };

  const submitDev = async (e: FormEvent) => {
    e.preventDefault();
    const user = await dev.mutateAsync(devName);
    onSignedIn(user);
  };

  const error = gh.error ?? dev.error;

  return (
    <div className="st-signin">
      <Button variant="primary" size="lg" block icon={<GitHubIcon />} loading={gh.isPending} onClick={startGitHub}>
        Continue with GitHub
      </Button>
      <div className="st-signin__explain">
        <p>
          <strong>GitHub is a free, safe place where your site’s files live. You own them.</strong> OpenSpace asks
          for permission once, then only touches the sites you make here.
        </p>
        <p>No GitHub account? You can make one for free on the next screen and you’ll come right back here.</p>
      </div>
      <p className="st-signin__public">
        Your site’s files are public, just like the site itself — so never put private information in them. Form
        entries, subscribers and orders are kept privately by OpenSpace, and you can export them any time.
      </p>
      {devAvailable && (
        <form className="st-signin__dev" onSubmit={submitDev}>
          <p className="st-signin__dev-title">Local test account</p>
          <p className="st-signin__dev-hint">This OpenSpace runs in test mode, so you can sign in with just a name.</p>
          <div className="st-signin__dev-row">
            <Field label="Your name">
              <Input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Sam Rivera" autoComplete="name" />
            </Field>
            <Button type="submit" variant="secondary" loading={dev.isPending} disabled={!devName.trim()}>
              Sign in
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p className="st-signin__error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}
