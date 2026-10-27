import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  FileCode2,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  githubAddress,
  useConvertRepo,
  useCreateImport,
  useSession,
  useUploadPage,
} from "../../api";
import { Wordmark } from "../../app/Wordmark";
import { Button, cx, Field, Input, Spinner, toast } from "../../ui";
import { SignInPanel } from "../auth/SignInPanel";
import "./Move.css";

const DRAFT_KEY = "openspace.moveDraft";

interface MoveDraft {
  url: string;
  name: string;
  mine: boolean;
  inPlace: boolean;
  render: boolean;
}

const EMPTY: MoveDraft = { url: "", name: "", mine: false, inPlace: false, render: false };

function loadDraft(): MoveDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<MoveDraft>) } : null;
  } catch {
    return null;
  }
}
function saveDraft(d: MoveDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** "Move an existing site": paste the address, confirm it's yours, and OpenSpace does the rest. */
export function MoveSite() {
  const session = useSession();
  const user = session.data?.user ?? null;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const resume = params.get("resume") === "1";
  const [draft, setDraft] = useState<MoveDraft>(() => ({
    ...EMPTY,
    ...loadDraft(),
    ...(params.get("url") ? { url: params.get("url") as string } : {}),
  }));
  const [step, setStep] = useState<"details" | "signin">("details");
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(draft.render);
  // GitHub sites can also be converted in place; that's a developer's choice, so it waits behind
  // "More options" (the default — a new site, the old one untouched — needs no decision).
  const [ghOptions, setGhOptions] = useState(draft.inPlace);
  const create = useCreateImport();
  const convert = useConvertRepo();
  const upload = useUploadPage();
  const inFlight = useRef(false);
  const gh = githubAddress(draft.url);
  const update = (patch: Partial<MoveDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const start = useCallback(
    (d: MoveDraft) => {
      if (inFlight.current) return;
      inFlight.current = true;
      saveDraft(d);
      const done = {
        onSettled: () => {
          inFlight.current = false;
        },
        onSuccess: (r: { import: { id: string } }) => {
          clearDraft();
          navigate(`/move/${r.import.id}`, { replace: true });
        },
        onError: (err: Error) => {
          setStep("details");
          setParams({}, { replace: true });
          toast({ tone: "danger", title: "Your site wasn’t moved", description: err.message });
        },
      };
      if (d.inPlace && githubAddress(d.url))
        convert.mutate({ repo: d.url.trim(), confirmOwnership: true }, done);
      else
        create.mutate(
          {
            url: d.url.trim(),
            confirmOwnership: true,
            ...(d.name.trim() ? { name: d.name.trim() } : {}),
            ...(d.render ? { render: true } : {}),
          },
          done,
        );
    },
    [convert, create, navigate, setParams],
  );

  // Back from GitHub sign-in: carry on.
  const resumed = useRef(false);
  useEffect(() => {
    if (resume && user && !resumed.current) {
      resumed.current = true;
      const saved = loadDraft();
      if (saved?.url && saved.mine) start(saved);
      else setParams({}, { replace: true });
    }
  }, [resume, user, start, setParams]);

  const busy =
    create.isPending || convert.isPending || upload.isPending || (resume && Boolean(user));

  /** "Upload a page": an HTML file or zip (a page Claude made) → an editable site, live at once. */
  const onPage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(?:html?|zip)$/i.test(file.name))
      return setError("Choose an .html file, or a .zip of your page and its pictures.");
    if (file.size > 30 * 1024 * 1024) return setError("That file is over 30 MB.");
    if (!draft.mine) return setError("Tick the box to confirm this is your site.");
    if (!user) return setStep("signin");
    setError(null);
    const reader = new FileReader();
    reader.onload = () =>
      upload.mutate(
        {
          confirmOwnership: true,
          html: { name: file.name, data: String(reader.result) },
          ...(draft.name.trim() ? { name: draft.name.trim() } : {}),
        },
        {
          onSuccess: (r) =>
            navigate(`/start/${r.site.id}`, {
              replace: true,
              state: { startedFrom: r.startedFrom },
            }),
          onError: (err) =>
            toast({
              tone: "danger",
              title: "Your page wasn’t brought in",
              description: err.message,
            }),
        },
      );
    reader.readAsDataURL(file);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.url.trim()) return setError("Paste your site’s address, like www.example.com.");
    if (!draft.mine) return setError("Tick the box to confirm this is your site.");
    setError(null);
    saveDraft(draft);
    if (user) start(draft);
    else setStep("signin");
  };

  if (busy)
    return (
      <div className="st-center st-move__starting">
        <Spinner size={18} label="Starting the move" />
        <p className="st-move__note">Starting the move…</p>
      </div>
    );

  return (
    <div className="st-move">
      <header className="st-move__top">
        <Wordmark to={user ? "/sites" : "/templates"} />
      </header>
      <main className="st-move__main">
        {step === "details" ? (
          <form className="st-move__form" onSubmit={submit} noValidate>
            <Link to={user ? "/sites" : "/templates"} className="st-move__back">
              <ArrowLeft aria-hidden="true" /> Back
            </Link>
            <span className="st-move__icon" aria-hidden="true">
              <ArrowRightLeft />
            </span>
            <h1 className="st-move__title">Move your site to OpenSpace</h1>
            <p className="st-move__lede">
              Paste your site’s address. We’ll bring its pages, posts, pictures and look across, put
              it online for free and open it for editing — usually in a few minutes. Your current
              site stays exactly as it is.
            </p>
            <Field label="Your site’s address" error={error && !draft.url.trim() ? error : null}>
              <Input
                size="lg"
                value={draft.url}
                placeholder="www.example.com"
                autoFocus
                inputMode="url"
                autoComplete="url"
                onChange={(e) => update({ url: e.target.value })}
              />
            </Field>
            <p className="st-move__hint">
              Works with Squarespace, WordPress, Wix, Webflow, GitHub Pages and most other sites.
            </p>
            {gh && !ghOptions && (
              <div className="st-move__advanced">
                <button
                  type="button"
                  className="st-move__more"
                  aria-expanded={false}
                  onClick={() => setGhOptions(true)}
                >
                  <ChevronDown aria-hidden="true" /> More options for GitHub sites
                </button>
              </div>
            )}
            {gh && ghOptions && (
              <fieldset className="st-move__choice">
                <legend>This site lives on GitHub. What would you like?</legend>
                <label className={cx("st-move__option", !draft.inPlace && "st-move__option--on")}>
                  <input
                    type="radio"
                    name="mode"
                    checked={!draft.inPlace}
                    onChange={() => update({ inPlace: false })}
                  />
                  <span>
                    <strong>Make a new OpenSpace site from it</strong>
                    <span>Your current site keeps running untouched.</span>
                  </span>
                </label>
                <label className={cx("st-move__option", draft.inPlace && "st-move__option--on")}>
                  <input
                    type="radio"
                    name="mode"
                    checked={draft.inPlace}
                    onChange={() => update({ inPlace: true })}
                  />
                  <span>
                    <strong>
                      <GitBranch size={13} aria-hidden="true" /> Make this site editable where it is
                    </strong>
                    <span>
                      Keeps its address and history. You approve the change on GitHub, and can undo
                      it with one click.
                    </span>
                  </span>
                </label>
              </fieldset>
            )}
            {!draft.inPlace && (
              <Field label="Name for your new site" aside="Optional">
                <Input
                  size="lg"
                  value={draft.name}
                  placeholder="We’ll use your site’s name"
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
            )}
            <label className="st-move__confirm">
              <input
                type="checkbox"
                checked={draft.mine}
                onChange={(e) => update({ mine: e.target.checked })}
              />
              <span>This is my site, or I’m moving it for its owner.</span>
            </label>
            {error && draft.url.trim() && (
              <p className="st-move__error" role="alert">
                {error}
              </p>
            )}
            {!draft.inPlace && (
              <div className="st-move__advanced">
                <button
                  type="button"
                  className="st-move__more"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced((v) => !v)}
                >
                  <ChevronDown aria-hidden="true" /> If pages come across empty
                </button>
                {advanced && (
                  <label className="st-move__confirm st-move__confirm--small">
                    <input
                      type="checkbox"
                      checked={draft.render}
                      onChange={(e) => update({ render: e.target.checked })}
                    />
                    <span>
                      Read pages the way a browser shows them (for sites built with JavaScript, like
                      some Wix sites). Slower.
                    </span>
                  </label>
                )}
              </div>
            )}
            <Button type="submit" variant="primary" size="lg" block icon={<Sparkles />}>
              {user ? "Move my site" : "Continue"}
            </Button>
            <div className="st-move__upload">
              <span>
                <strong>Have a page Claude made, or an HTML file?</strong> Upload it instead — it
                becomes your site, every word and picture editable.
              </span>
              <label className="st-move__upload-button">
                <input
                  type="file"
                  accept=".html,.htm,.zip,text/html,application/zip"
                  className="st-visually-hidden"
                  onChange={onPage}
                />
                <FileCode2 aria-hidden="true" className="st-move__upload-icon" /> Upload a page
              </label>
            </div>
            <p className="st-move__fine">
              Nothing to install. Shops, members and other extras are set up afterwards, step by
              step.
            </p>
          </form>
        ) : (
          <div className="st-move__form">
            <button type="button" className="st-move__back" onClick={() => setStep("details")}>
              <ArrowLeft aria-hidden="true" /> Back
            </button>
            <h1 className="st-move__title">Sign in to move your site</h1>
            <SignInPanel
              github={{ returnTo: "/move?resume=1" }}
              beforeRedirect={() => saveDraft(draft)}
              onSignedIn={() => start(draft)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
