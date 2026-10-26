/**
 * Server-rendered pages of the "Connect your AI" authorization flow: sign-in, the per-site
 * consent screen and errors. Plain HTML (no scripts); every client-supplied string is escaped.
 */
import { escapeHtml as esc } from "../services/renderer";

const STYLE = `
:root{color-scheme:light dark;--bg:#f7f7f5;--card:#fff;--text:#1d1d1f;--muted:#6b6b70;--line:#e3e3e0;--accent:#2f5bea;--accent-text:#fff;--warn:#8a5a00}
@media (prefers-color-scheme:dark){:root{--bg:#141415;--card:#1d1d1f;--text:#f2f2f2;--muted:#a1a1a6;--line:#333336;--accent:#7c9bff;--accent-text:#0b0b0c;--warn:#f0c36b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:30rem;margin:8vh auto;padding:0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
h1{font-size:20px;line-height:1.3;margin:0 0 6px}p{margin:0 0 14px}.muted{color:var(--muted);font-size:13px}
.brand{font-weight:600;letter-spacing:-.01em;margin-bottom:18px;font-size:14px}
fieldset{border:0;padding:0;margin:18px 0}legend{font-weight:600;font-size:13px;margin-bottom:8px;padding:0}
label.row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;cursor:pointer}
label.row input{margin-top:3px}label.row small{display:block;color:var(--muted);font-size:12px}
input[type=text]{width:100%;font:inherit;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
.actions{display:flex;gap:10px;margin-top:20px}
button,.button{font:inherit;font-weight:600;padding:9px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer;text-decoration:none;display:inline-block}
button.primary,.button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}
.warn{color:var(--warn);font-size:13px}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`;

/**
 * Headers for the flow's pages. `form-action` also governs where the consent form's redirect may
 * go, so the page allows the client's registered redirect target (`formTargets`): its origin, or
 * its scheme for a native app's private-use URI.
 */
export function pageHeaders(formTargets: string[] = []): Record<string, string> {
  const formAction = [
    "'self'",
    "https:",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "http://[::1]:*",
    ...formTargets,
  ].join(" ");
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

/** A redirect URI as a CSP source: `https://host:port` / `http://localhost:1234`, or `scheme:`. */
export function formTargetFor(redirectUri: string): string | null {
  try {
    const u = new URL(redirectUri);
    if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    return /^[a-z][a-z0-9+.-]*:$/i.test(u.protocol) ? u.protocol : null;
  } catch {
    return null;
  }
}

export function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main><div class="card"><div class="brand">OpenSpace</div>${body}</div></main></body></html>`;
}

export function errorPage(title: string, message: string): string {
  return page(title, `<h1>${esc(title)}</h1><p>${esc(message)}</p>`);
}

export function signInPage(input: {
  clientName: string;
  returnTo: string;
  devMode: boolean;
  githubUrl: string | null;
}): string {
  const dev = input.devMode
    ? `<form method="post" action="/authorize/dev-login">
        <input type="hidden" name="return" value="${esc(input.returnTo)}">
        <label for="name" class="muted">Your name (dev sign-in)</label>
        <input id="name" name="name" type="text" required maxlength="60" autocomplete="name">
        <div class="actions"><button class="primary" type="submit">Continue</button></div>
      </form>`
    : "";
  const gh = input.githubUrl
    ? `<div class="actions"><a class="button primary" href="${esc(input.githubUrl)}">Sign in with GitHub</a></div>`
    : "";
  return page(
    "Sign in to connect",
    `<h1>Sign in to connect ${esc(input.clientName)}</h1>
     <p class="muted">${esc(input.clientName)} wants to work on your OpenSpace sites. Sign in first; you'll choose which sites next.</p>
     ${gh}${dev}${!gh && !dev ? "<p>Sign-in isn't set up on this Hub.</p>" : ""}`,
  );
}

export function consentPage(input: {
  handle: string;
  clientName: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  userName: string;
  sites: Array<{ id: string; name: string; role: string }>;
}): string {
  const sites = input.sites
    .map(
      (s) =>
        // Pre-checked only when there is nothing to choose; otherwise the person picks.
        `<label class="row"><input type="checkbox" name="site" value="${esc(s.id)}"${
          input.sites.length === 1 ? " checked" : ""
        }><span>${esc(s.name)}<small>You're ${esc(s.role === "owner" ? "the owner" : `a ${s.role}`)}</small></span></label>`,
    )
    .join("");
  return page(
    `Allow ${input.clientName}?`,
    `<h1>Allow ${esc(input.clientName)} to edit your sites?</h1>
     <p class="muted">Signed in as ${esc(input.userName)}. Its changes go to your draft, where you can see them live in Studio and undo them. It can't change your site's code.</p>
     <p class="muted">After you allow it, you'll return to <strong>${esc(input.redirectHost)}</strong>.</p>
     ${input.redirectIsLoopback ? '<p class="warn">This returns to an app on this computer. Only continue if you just started connecting it.</p>' : ""}
     <form method="post" action="/authorize">
       <input type="hidden" name="handle" value="${esc(input.handle)}">
       <fieldset><legend>Sites it can edit</legend>${sites}</fieldset>
       <fieldset><legend>Publishing</legend>
         <label class="row"><input type="checkbox" name="publish" value="1"><span>Allow publishing<small>It still has to ask you first each time. Off by default — you can change this later in Studio.</small></span></label>
       </fieldset>
       <div class="actions">
         <button class="primary" type="submit" name="action" value="allow">Allow</button>
         <button type="submit" name="action" value="deny">Cancel</button>
       </div>
     </form>`,
  );
}
