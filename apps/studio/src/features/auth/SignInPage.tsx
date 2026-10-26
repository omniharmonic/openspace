import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useSession } from "../../api";
import { Wordmark } from "../../app/Wordmark";
import { Spinner } from "../../ui";
import { SignInPanel } from "./SignInPanel";
import "./SignInPage.css";

/** Only same-origin paths are allowed as a post-sign-in destination (no open redirects). */
export function safeNext(next: string | null, origin = window.location.origin): string {
  const fallback = "/sites";
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function SignInPage() {
  const session = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  if (session.isPending) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading" />
      </div>
    );
  }
  if (session.data?.user) return <Navigate to={next} replace />;
  return (
    <div className="st-signin-page">
      <div className="st-signin-page__card">
        <Wordmark to="/templates" />
        <h1 className="st-signin-page__title">Sign in to OpenSpace</h1>
        <SignInPanel
          github={{ returnTo: next }}
          onSignedIn={() => navigate(next, { replace: true })}
        />
      </div>
    </div>
  );
}
