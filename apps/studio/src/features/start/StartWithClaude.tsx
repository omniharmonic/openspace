import {
  ArrowLeft,
  FileCode2,
  FileText,
  ImagePlus,
  Images,
  Palette,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { type StartInput, useSession, useStartSite } from "../../api";
import { Wordmark } from "../../app/Wordmark";
import { Button, cx, Field, IconButton, Input, Spinner, TextArea, toast } from "../../ui";
import { SignInPanel } from "../auth/SignInPanel";
import "./Start.css";

const DRAFT_KEY = "openspace.startDraft";

/** Words people pick for how a site should feel (they can add their own). */
export const FEELINGS = [
  "warm",
  "calm",
  "bold",
  "playful",
  "elegant",
  "earthy",
  "modern",
  "bright",
  "trustworthy",
  "handmade",
] as const;

interface Draft {
  name: string;
  about: string;
  audience: string;
  feeling: string[];
  colors: string[];
  headingFont: string;
  bodyFont: string;
}

const EMPTY: Draft = {
  name: "",
  about: "",
  audience: "",
  feeling: [],
  colors: [],
  headingFont: "",
  bodyFont: "",
};

function loadDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}
function saveDraft(d: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // storage unavailable: the form still works
  }
}
export function clearStartDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** Files they brought, read in the browser and sent with the request. */
interface Brought {
  tokens?: { name: string; text: string };
  logo?: { name: string; data: string };
  photos: Array<{ name: string; data: string }>;
  brandDoc?: { name: string; text?: string; data?: string };
  page?: { name: string; data: string };
}

const MB = 1024 * 1024;

const readAs = (file: File, how: "text" | "dataUrl") =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
    if (how === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });

/** Sort a file into what it is, by its name and type (they never have to say). */
export function kindOf(file: { name: string; type: string }): keyof Brought | "unknown" {
  const n = file.name.toLowerCase();
  if (/\.(?:html?|zip)$/.test(n)) return "page";
  if (/\.json$/.test(n) || file.type === "application/json") return "tokens";
  if (/\.(?:pdf|md|markdown|txt|docx?)$/.test(n)) return "brandDoc";
  if (file.type.startsWith("image/") || /\.(?:png|jpe?g|webp|gif|svg)$/.test(n))
    return /logo|mark|wordmark|icon/.test(n) ? "logo" : "photos";
  return "unknown";
}

type Step = "idea" | "signin" | "brand";

/**
 * "Start with Claude": say what the site is for, bring anything you have, and a good site goes
 * live straight away — then Claude designs it properly with you.
 */
export function StartWithClaude() {
  const session = useSession();
  const user = session.data?.user ?? null;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY, ...loadDraft() }));
  const [step, setStep] = useState<Step>(() => (params.get("step") === "brand" ? "brand" : "idea"));
  const [brought, setBrought] = useState<Brought>({ photos: [] });
  const [error, setError] = useState<string | null>(null);
  const [ownFeeling, setOwnFeeling] = useState("");
  const start = useStartSite();
  const inFlight = useRef(false);
  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });

  // Back from GitHub sign-in: carry on with the brand step.
  useEffect(() => {
    if (params.get("resume") === "1" && user) {
      setStep("brand");
      setParams({}, { replace: true });
    }
  }, [params, user, setParams]);

  const toggleFeeling = (f: string) =>
    update({
      feeling: draft.feeling.includes(f)
        ? draft.feeling.filter((x) => x !== f)
        : [...draft.feeling, f].slice(0, 8),
    });

  const continueIdea = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setError("Give your site a name. You can change it later.");
    if (!draft.about.trim())
      return setError("Say a few words about what it's for — Claude starts from this.");
    setError(null);
    saveDraft(draft);
    setStep(user ? "brand" : "signin");
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Brought = { ...brought, photos: [...brought.photos] };
    for (const file of Array.from(files)) {
      const kind = kindOf(file);
      try {
        if (kind === "tokens") {
          if (file.size > 400_000)
            throw new Error(`${file.name} is too large for a design-token file.`);
          const text = await readAs(file, "text");
          JSON.parse(text);
          next.tokens = { name: file.name, text };
        } else if (kind === "page") {
          if (file.size > 30 * MB) throw new Error(`${file.name} is over 30 MB.`);
          next.page = { name: file.name, data: await readAs(file, "dataUrl") };
        } else if (kind === "logo") {
          if (file.size > MB) throw new Error(`${file.name} is over 1 MB. Try a smaller logo.`);
          if (/svg/.test(file.type))
            throw new Error("Use a PNG or JPG of your logo (SVG isn't supported yet).");
          next.logo = { name: file.name, data: await readAs(file, "dataUrl") };
        } else if (kind === "photos") {
          if (file.size > 8 * MB)
            throw new Error(`${file.name} is over 8 MB. Try a smaller version.`);
          if (next.photos.length >= 8) throw new Error("Eight photos is plenty to start with.");
          next.photos.push({ name: file.name, data: await readAs(file, "dataUrl") });
        } else if (kind === "brandDoc") {
          if (file.size > 10 * MB) throw new Error(`${file.name} is over 10 MB.`);
          next.brandDoc = /\.(?:md|markdown|txt)$/i.test(file.name)
            ? { name: file.name, text: (await readAs(file, "text")).slice(0, 20_000) }
            : { name: file.name, data: await readAs(file, "dataUrl") };
        } else throw new Error(`We don't know what to do with ${file.name} yet.`);
      } catch (e) {
        toast({
          tone: "danger",
          title: "That file wasn't added",
          description:
            e instanceof SyntaxError
              ? `${file.name} isn't a valid design-token file (JSON).`
              : (e as Error).message,
        });
      }
    }
    setBrought(next);
  };

  const make = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    const input: StartInput = {
      name: draft.name.trim(),
      about: draft.about.trim(),
      ...(draft.audience.trim() ? { audience: draft.audience.trim() } : {}),
      ...(draft.feeling.length ? { feeling: draft.feeling } : {}),
      ...(draft.colors.length ? { colors: draft.colors } : {}),
      ...(draft.headingFont.trim() || draft.bodyFont.trim()
        ? {
            fonts: {
              ...(draft.headingFont.trim() ? { heading: draft.headingFont.trim() } : {}),
              ...(draft.bodyFont.trim() ? { body: draft.bodyFont.trim() } : {}),
            },
          }
        : {}),
      ...(brought.tokens ? { tokens: brought.tokens.text, tokensName: brought.tokens.name } : {}),
      ...(brought.logo ? { logo: brought.logo.data } : {}),
      ...(brought.photos.length ? { photos: brought.photos } : {}),
      ...(brought.brandDoc ? { brandDoc: brought.brandDoc } : {}),
      ...(brought.page ? { html: brought.page } : {}),
    };
    start.mutate(input, {
      onSettled: () => {
        inFlight.current = false;
      },
      onSuccess: (r) => {
        navigate(`/start/${r.site.id}`, {
          replace: true,
          state: {
            startedFrom: r.startedFrom,
            brief: { about: input.about, audience: input.audience, feeling: input.feeling },
          },
        });
        clearStartDraft();
      },
      onError: (err) =>
        toast({ tone: "danger", title: "Your site wasn’t started", description: err.message }),
    });
  }, [brought, draft, navigate, start]);

  if (start.isPending)
    return (
      <div className="st-center st-start__starting">
        <Spinner size={18} label="Starting your site" />
        <p className="st-start__note">
          {brought.page ? "Making your page editable…" : "Choosing a starting point in your style…"}
        </p>
      </div>
    );

  return (
    <div className="st-start">
      <header className="st-start__top">
        <Wordmark to={user ? "/sites" : "/templates"} />
        <ol className="st-start__steps" aria-label="Steps">
          {[
            ["idea", "Your idea"],
            ["brand", "What you have"],
            ["live", "Live, then Claude designs it"],
          ].map(([id, label], i) => (
            <li
              key={id}
              className={cx(
                "st-start__step",
                (step === id || (step === "signin" && id === "brand")) && "is-current",
              )}
              aria-current={step === id ? "step" : undefined}
            >
              <span aria-hidden="true">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <span />
      </header>
      <main className="st-start__main">
        {step === "idea" && (
          <form className="st-start__form" onSubmit={continueIdea} noValidate>
            <Link to={user ? "/sites" : "/templates"} className="st-start__back">
              <ArrowLeft aria-hidden="true" /> Back
            </Link>
            <span className="st-start__icon" aria-hidden="true">
              <Sparkles />
            </span>
            <h1 className="st-start__title">Start with Claude</h1>
            <p className="st-start__lede">
              Tell us about your idea in your own words. A good site goes live in a couple of
              minutes — then Claude designs it properly with you, step by step.
            </p>
            <Field label="Site name" error={error && !draft.name.trim() ? error : null}>
              <Input
                size="lg"
                value={draft.name}
                placeholder="Crumb & Kettle"
                autoFocus
                maxLength={80}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>
            <Field
              label="What is it for?"
              hint="Your business, project or cause — a sentence or two."
              error={error && draft.name.trim() && !draft.about.trim() ? error : null}
            >
              <TextArea
                rows={3}
                value={draft.about}
                maxLength={2000}
                placeholder="A neighbourhood bakery in Leith: sourdough, pastries and a proper pot of tea."
                onChange={(e) => update({ about: e.target.value })}
              />
            </Field>
            <Field label="Who is it for?" aside="Optional">
              <Input
                value={draft.audience}
                maxLength={1000}
                placeholder="Locals on their way to work, families at the weekend"
                onChange={(e) => update({ audience: e.target.value })}
              />
            </Field>
            <fieldset className="st-start__feel">
              <legend>How should it feel?</legend>
              <div className="st-start__chips">
                {[...new Set([...FEELINGS, ...draft.feeling])].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={cx("st-start__chip", draft.feeling.includes(f) && "is-on")}
                    aria-pressed={draft.feeling.includes(f)}
                    onClick={() => toggleFeeling(f)}
                  >
                    {f}
                  </button>
                ))}
                <span className="st-start__own">
                  <Input
                    size="sm"
                    value={ownFeeling}
                    placeholder="Your own word"
                    maxLength={40}
                    aria-label="Add your own word"
                    onChange={(e) => setOwnFeeling(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && ownFeeling.trim()) {
                        e.preventDefault();
                        toggleFeeling(ownFeeling.trim().toLowerCase());
                        setOwnFeeling("");
                      }
                    }}
                  />
                  <IconButton
                    label="Add word"
                    size="sm"
                    icon={<Plus />}
                    onClick={() => {
                      if (!ownFeeling.trim()) return;
                      toggleFeeling(ownFeeling.trim().toLowerCase());
                      setOwnFeeling("");
                    }}
                  />
                </span>
              </div>
            </fieldset>
            <Button type="submit" variant="primary" size="lg" block>
              Continue
            </Button>
            <p className="st-start__fine">
              Prefer to pick a design yourself? <Link to="/templates">Start from a template</Link>.
              Already have a site? <Link to="/move">Move it here</Link>.
            </p>
          </form>
        )}

        {step === "signin" && (
          <div className="st-start__form">
            <button type="button" className="st-start__back" onClick={() => setStep("idea")}>
              <ArrowLeft aria-hidden="true" /> Back
            </button>
            <h1 className="st-start__title">Sign in to keep {draft.name.trim() || "your site"}</h1>
            <p className="st-start__lede">
              Your site will belong to you — saved in your own free GitHub account.
            </p>
            <SignInPanel
              github={{ returnTo: "/start/form?resume=1" }}
              beforeRedirect={() => saveDraft(draft)}
              onSignedIn={() => setStep("brand")}
            />
          </div>
        )}

        {step === "brand" && (
          <div className="st-start__form st-start__form--wide">
            <button type="button" className="st-start__back" onClick={() => setStep("idea")}>
              <ArrowLeft aria-hidden="true" /> Back
            </button>
            <h1 className="st-start__title">Bring anything you already have</h1>
            <p className="st-start__lede">
              All optional. Add your brand files and Claude will design with them; add a page Claude
              made for you and it becomes your site, ready to edit.
            </p>
            <BroughtList brought={brought} onChange={setBrought} />
            <label className="st-start__drop">
              <input
                type="file"
                multiple
                className="st-visually-hidden"
                accept=".json,.html,.htm,.zip,.png,.jpg,.jpeg,.webp,.gif,.pdf,.md,.txt,.doc,.docx"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="st-start__drop-icon" aria-hidden="true">
                <ImagePlus />
              </span>
              <strong>Add files</strong>
              <span>
                Your logo and photos · a design system or brand kit (.json from Claude, Canva or
                Figma) · a brand guide · a page Claude made (.html or .zip)
              </span>
            </label>
            <div className="st-start__pair">
              <div>
                <span className="st-start__label">
                  <Palette aria-hidden="true" /> Brand colours
                </span>
                <div className="st-start__colors">
                  {draft.colors.map((c, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: colours are positional
                    <span key={i} className="st-start__color">
                      <input
                        type="color"
                        value={c}
                        aria-label={`Colour ${i + 1}`}
                        onChange={(e) =>
                          update({
                            colors: draft.colors.map((x, j) => (j === i ? e.target.value : x)),
                          })
                        }
                      />
                      <IconButton
                        label={`Remove colour ${i + 1}`}
                        size="sm"
                        icon={<X />}
                        onClick={() => update({ colors: draft.colors.filter((_, j) => j !== i) })}
                      />
                    </span>
                  ))}
                  {draft.colors.length < 4 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Palette />}
                      onClick={() =>
                        update({
                          colors: [...draft.colors, draft.colors.length ? "#f4efe6" : "#b5532a"],
                        })
                      }
                    >
                      {draft.colors.length ? "Add another" : "Add your main colour"}
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <span className="st-start__label">Fonts you use</span>
                <div className="st-start__fonts">
                  <Input
                    size="sm"
                    value={draft.headingFont}
                    placeholder="Headings, e.g. Fraunces"
                    aria-label="Heading font"
                    onChange={(e) => update({ headingFont: e.target.value })}
                  />
                  <Input
                    size="sm"
                    value={draft.bodyFont}
                    placeholder="Text, e.g. Work Sans"
                    aria-label="Text font"
                    onChange={(e) => update({ bodyFont: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <Button variant="primary" size="lg" block icon={<Sparkles />} onClick={make}>
              {brought.page ? "Make my page into a site" : "Make my site"}
            </Button>
            <p className="st-start__fine">
              Nothing to install. Your site goes live on free hosting in a couple of minutes; shops,
              members and your own web address are set up afterwards, step by step.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function BroughtList({ brought, onChange }: { brought: Brought; onChange: (b: Brought) => void }) {
  const rows: Array<{
    key: string;
    icon: ReactNode;
    what: string;
    name: string;
    remove: () => void;
  }> = [];
  if (brought.page)
    rows.push({
      key: "page",
      icon: <FileCode2 />,
      what: "Your page — it becomes the site, every word and picture editable",
      name: brought.page.name,
      remove: () => onChange({ ...brought, page: undefined }),
    });
  if (brought.tokens)
    rows.push({
      key: "tokens",
      icon: <Palette />,
      what: "Design system — colours, fonts and sizes",
      name: brought.tokens.name,
      remove: () => onChange({ ...brought, tokens: undefined }),
    });
  if (brought.logo)
    rows.push({
      key: "logo",
      icon: <ImagePlus />,
      what: "Logo",
      name: brought.logo.name,
      remove: () => onChange({ ...brought, logo: undefined }),
    });
  brought.photos.forEach((p, i) => {
    rows.push({
      key: `photo-${i}`,
      icon: <Images />,
      what: "Photo",
      name: p.name,
      remove: () => onChange({ ...brought, photos: brought.photos.filter((_, j) => j !== i) }),
    });
  });
  if (brought.brandDoc)
    rows.push({
      key: "doc",
      icon: <FileText />,
      what: "Brand guide — Claude reads it",
      name: brought.brandDoc.name,
      remove: () => onChange({ ...brought, brandDoc: undefined }),
    });
  if (!rows.length) return null;
  return (
    <ul className="st-start__brought" aria-label="What you added">
      {rows.map((r) => (
        <li key={r.key}>
          <span aria-hidden="true">{r.icon}</span>
          <span>
            <strong>{r.what}</strong>
            <span>{r.name}</span>
          </span>
          <IconButton label={`Remove ${r.name}`} size="sm" icon={<X />} onClick={r.remove} />
        </li>
      ))}
    </ul>
  );
}
