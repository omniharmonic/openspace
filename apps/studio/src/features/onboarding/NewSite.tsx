import { ArrowLeft, ImagePlus, Paintbrush, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useCreateSite, useSession, useTemplates } from "../../api";
import type { TemplateSummary } from "../../api/types";
import { Wordmark } from "../../app/Wordmark";
import {
  Button,
  ColorPickerPanel,
  type ColorToken,
  cx,
  EmptyState,
  Field,
  IconButton,
  Input,
  Popover,
  Spinner,
  toast,
} from "../../ui";
import { normalizeHex } from "../../ui/color";
import { SignInPanel } from "../auth/SignInPanel";
import { LookPicker } from "../templates/LookPicker";
import { SiteSketch } from "../templates/SiteSketch";
import { BuildingProgress } from "./BuildingProgress";
import { clearDraft, loadDraft, type SiteDraft, saveDraft } from "./draft";
import "./NewSite.css";

const MAX_LOGO_BYTES = 1_000_000;

type Step = "details" | "signin";

function StepIndicator({ current, signedIn }: { current: Step; signedIn: boolean }) {
  const items = [
    { id: "details", label: "Your details" },
    { id: "signin", label: "Sign in" },
    { id: "live", label: "Go live" },
  ];
  const index = current === "details" ? 0 : 1;
  return (
    <ol className="st-new__steps" aria-label="Steps">
      {items.map((it, i) => {
        const done = i < index || (it.id === "signin" && signedIn);
        return (
          <li
            key={it.id}
            className={cx(
              "st-new__step",
              i === index && "st-new__step--current",
              done && "st-new__step--done",
            )}
            aria-current={i === index ? "step" : undefined}
          >
            <span className="st-new__step-num" aria-hidden="true">
              {i + 1}
            </span>
            {it.label}
          </li>
        );
      })}
    </ol>
  );
}

function BrandColorField({
  value,
  onChange,
  tokens,
}: {
  value: string | undefined;
  onChange: (hex: string | undefined) => void;
  tokens: ColorToken[];
}) {
  return (
    <div className="st-new__color">
      <Popover
        title="Brand color"
        width={240}
        trigger={
          <Button
            variant="secondary"
            icon={
              value ? (
                <span className="st-new__chip" style={{ background: value }} />
              ) : (
                <Paintbrush />
              )
            }
          >
            {value ? value.toUpperCase() : "Add brand color"}
          </Button>
        }
      >
        <ColorPickerPanel
          tokens={tokens}
          value={value ? { kind: "exact", hex: value } : null}
          onChange={(v) => {
            const hex = v.kind === "exact" ? v.hex : tokens.find((t) => t.id === v.token)?.value;
            onChange(hex ? (normalizeHex(hex) ?? undefined) : undefined);
          }}
        />
      </Popover>
      {value && (
        <IconButton
          label="Remove brand color"
          icon={<X />}
          size="sm"
          onClick={() => onChange(undefined)}
        />
      )}
    </div>
  );
}

function LogoField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return setError("Choose an image file (PNG, JPG, SVG or WebP).");
    if (file.size > MAX_LOGO_BYTES)
      return setError("That image is over 1 MB. Try a smaller version of your logo.");
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };
  return (
    <div className="st-new__logo">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="st-visually-hidden"
        tabIndex={-1}
        aria-label="Logo file"
        onChange={onFile}
      />
      {value ? (
        <>
          <img src={value} alt="Your logo" className="st-new__logo-img" />
          <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
            Replace
          </Button>
          <IconButton
            label="Remove logo"
            icon={<X />}
            size="sm"
            onClick={() => onChange(undefined)}
          />
        </>
      ) : (
        <Button variant="secondary" icon={<ImagePlus />} onClick={() => input.current?.click()}>
          Upload logo
        </Button>
      )}
      {error && (
        <p className="st-new__logo-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function NewSiteFlow({ template }: { template: TemplateSummary }) {
  const session = useSession();
  const user = session.data?.user ?? null;
  const [params, setParams] = useSearchParams();
  const create = useCreateSite();
  const siteId = params.get("site");
  const resume = params.get("resume") === "1";

  const [draft, setDraft] = useState<SiteDraft>(() => {
    const saved = loadDraft(template.id);
    const look = params.get("look") ?? saved?.look;
    return {
      template: template.id,
      name: "",
      tagline: "",
      ...saved,
      look: template.looks.some((l) => l.id === look)
        ? (look as string)
        : (template.looks[0]?.id ?? ""),
    };
  });
  const [step, setStep] = useState<Step>("details");
  const [nameError, setNameError] = useState<string | null>(null);
  const look = template.looks.find((l) => l.id === draft.look) ?? template.looks[0];
  const update = (patch: Partial<SiteDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const startCreate = useCallback(
    (d: SiteDraft) => {
      saveDraft(d);
      create.mutate(
        {
          template: d.template,
          look: d.look,
          name: d.name.trim(),
          tagline: d.tagline.trim(),
          ...(d.brandColor ? { brandColor: d.brandColor } : {}),
          ...(d.logo ? { logo: d.logo } : {}),
        },
        {
          onSuccess: (site) => setParams({ look: d.look, site: site.id }, { replace: true }),
          onError: (err) => {
            toast({ tone: "danger", title: "Your site wasn’t created", description: err.message });
            // Back from GitHub: drop `resume` so the details form returns with the saved draft.
            setParams(
              (p) => {
                const next = new URLSearchParams(p);
                next.delete("resume");
                return next;
              },
              { replace: true },
            );
          },
        },
      );
    },
    [create, setParams],
  );

  // Back from GitHub sign-in: carry on where the person left off.
  const resumed = useRef(false);
  useEffect(() => {
    if (resume && user && !siteId && !resumed.current) {
      resumed.current = true;
      const saved = loadDraft(template.id);
      if (saved?.name) startCreate(saved);
      else setParams({ look: draft.look }, { replace: true });
    }
  }, [resume, user, siteId, template.id, startCreate, setParams, draft.look]);

  const onDone = useCallback(() => clearDraft(template.id), [template.id]);

  if (!look) return null;

  if (siteId) {
    return (
      <BuildingProgress
        siteId={siteId}
        template={template}
        look={look}
        draft={loadDraft(template.id) ?? draft}
        onDone={onDone}
      />
    );
  }

  if (create.isPending || (resume && user)) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Starting your site" />
      </div>
    );
  }

  const submitDetails = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setNameError("Give your site a name. You can change it later.");
      return;
    }
    setNameError(null);
    saveDraft(draft);
    if (user) startCreate(draft);
    else setStep("signin");
  };

  const sample = template.sample ?? { name: template.name, tagline: template.description };
  const colorTokens: ColorToken[] = [
    { id: "accent", name: "Accent", value: look.styles.colors.accent },
    { id: "text", name: "Text", value: look.styles.colors.text },
    { id: "surface", name: "Surface", value: look.styles.colors.surface },
    { id: "background", name: "Background", value: look.styles.colors.background },
  ];

  return (
    <div className="st-new">
      <header className="st-new__top">
        <Wordmark to={user ? "/sites" : "/templates"} />
        <StepIndicator current={step} signedIn={Boolean(user)} />
        <span className="st-new__top-spacer" />
      </header>
      <main className="st-new__main">
        <section className="st-new__form-col">
          {step === "details" ? (
            <form className="st-new__form" onSubmit={submitDetails} noValidate>
              <Link to="/templates" className="st-new__back">
                <ArrowLeft aria-hidden="true" /> All templates
              </Link>
              <h1 className="st-new__title">Make it yours</h1>
              <p className="st-new__lede">
                Starting from <strong>{template.name}</strong>. Everything here can be changed later
                in the editor.
              </p>
              <Field label="Site name" error={nameError}>
                <Input
                  size="lg"
                  value={draft.name}
                  placeholder={sample.name}
                  autoFocus
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="One line about what you do" aside="Optional">
                <Input
                  size="lg"
                  value={draft.tagline}
                  placeholder={sample.tagline}
                  maxLength={140}
                  onChange={(e) => update({ tagline: e.target.value })}
                />
              </Field>
              <div className="st-new__pair">
                <div className="st-new__mini-field">
                  <span className="st-new__mini-label">Brand color</span>
                  <BrandColorField
                    value={draft.brandColor}
                    onChange={(brandColor) => update({ brandColor })}
                    tokens={colorTokens}
                  />
                </div>
                <div className="st-new__mini-field">
                  <span className="st-new__mini-label">Logo</span>
                  <LogoField value={draft.logo} onChange={(logo) => update({ logo })} />
                </div>
              </div>
              <Button type="submit" variant="primary" size="lg" block loading={create.isPending}>
                {user ? "Create my site" : "Continue"}
              </Button>
            </form>
          ) : (
            <div className="st-new__form">
              <button type="button" className="st-new__back" onClick={() => setStep("details")}>
                <ArrowLeft aria-hidden="true" /> Back to details
              </button>
              <h1 className="st-new__title">Sign in to save {draft.name.trim() || "your site"}</h1>
              <SignInPanel
                github={{
                  template: template.id,
                  name: draft.name.trim(),
                  returnTo: `/new/${template.id}?look=${draft.look}&resume=1`,
                }}
                beforeRedirect={() => saveDraft(draft)}
                onSignedIn={() => startCreate(draft)}
              />
            </div>
          )}
        </section>
        <section className="st-new__preview-col" aria-label="Preview">
          <div className="st-new__preview">
            <SiteSketch
              styles={look.styles}
              name={draft.name.trim() || sample.name}
              tagline={draft.tagline.trim() || (draft.name.trim() ? "" : sample.tagline)}
              logo={draft.logo}
              accent={draft.brandColor}
            />
          </div>
          <div className="st-new__look">
            <span className="st-new__mini-label">Look</span>
            <LookPicker
              looks={template.looks}
              value={draft.look}
              onValueChange={(id) => update({ look: id })}
              label={`${template.name} looks`}
              showNames
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export function NewSite() {
  const { template: templateId } = useParams();
  const templates = useTemplates();
  const navigate = useNavigate();
  if (templates.isPending) {
    return (
      <div className="st-center">
        <Spinner size={18} label="Loading template" />
      </div>
    );
  }
  const template = templates.data?.find((t) => t.id === templateId);
  if (!template) {
    return (
      <div className="st-center">
        <EmptyState
          title="That template isn’t available"
          description="It may have been renamed. Pick another one from the gallery."
          action={
            <Button variant="primary" onClick={() => navigate("/templates")}>
              Browse templates
            </Button>
          }
        />
      </div>
    );
  }
  return <NewSiteFlow key={template.id} template={template} />;
}
