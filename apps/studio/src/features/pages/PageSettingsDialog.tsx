import { type Issue, seoCheck, sortIssues } from "@openspace/lint";
import type { OpBody } from "@openspace/ops";
import type { Page, SiteDocument } from "@openspace/schema";
import { Cloud, ImagePlus, KeyRound, Lock, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { usePagePasswords, useSetPagePassword } from "../../api";
import {
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  Segmented,
  TextArea,
  Toggle,
  toast,
} from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { MediaThumb } from "../media/MediaLibrary";
import { can, useCurrentSite, useManageUi } from "../site-mgmt/manage-ui";
import "./pages.css";
import { rowForPage, updateItem, withPage } from "./navTree";
import {
  normalizeSlug,
  type PageSettingsInput,
  pageSettingsOf,
  slugProblem,
  updatePageSettings,
} from "./pageOps";
import { pageUrl, SeoPreview } from "./SeoPreview";

type Access = PageSettingsInput["access"];

function Switch({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="st-switch-row">
      <div>
        <span className="st-switch-row__label" id={`${id}-label`}>
          {label}
        </span>
        {hint && (
          <span className="st-switch-row__hint" id={`${id}-hint`}>
            {hint}
          </span>
        )}
      </div>
      <Toggle
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </div>
  );
}

/** Page settings: name, address, visibility, access, search & sharing (with live previews). */
export function PageSettingsDialog() {
  const pageId = useManageUi((s) => s.pageSettings);
  const page = useDocStore((s) =>
    pageId ? s.doc.pages[pageId as keyof SiteDocument["pages"]] : undefined,
  );
  const close = () => useManageUi.getState().openPageSettings(null);
  return (
    <Dialog
      open={Boolean(page)}
      onOpenChange={(o) => !o && close()}
      title={page ? `${page.title} settings` : "Page settings"}
      width={860}
      className="st-page-dialog"
    >
      {page && <PageSettingsForm key={page.id} page={page} onClose={close} />}
    </Dialog>
  );
}

function PageSettingsForm({ page, onClose }: { page: Page; onClose: () => void }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const site = useCurrentSite();
  const navigate = useNavigate();
  const designer = can(site, "designer");
  const [form, setForm] = useState(() => ({ ...pageSettingsOf(page), redirectOld: true }));
  const navRow = rowForPage(doc.site.nav, page.id);
  const [inNav, setInNav] = useState(Boolean(navRow && !navRow.item.hidden));
  const [password, setPassword] = useState("");
  const passwords = usePagePasswords(
    site?.id ?? "",
    Boolean(site) && designer && (form.access === "password" || Boolean(page.access?.password)),
  );
  const setPw = useSetPagePassword(site?.id ?? "");
  const hasPassword = passwords.data?.some((p) => p.pageId === page.id) ?? false;
  const cloudflare = site?.deployTarget === "cloudflare";
  const isHome = page.slug === "";

  useEffect(() => {
    if (form.unlisted) setInNav(false);
  }, [form.unlisted]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const slug = isHome ? "" : normalizeSlug(form.slug);
  const slugError = isHome
    ? null
    : !slug
      ? "Give the page an address."
      : slugProblem(doc, slug, page.id);
  const titleError = form.title.trim() ? null : "Give the page a name.";
  const slugChanged = !isHome && slug !== page.slug;

  // The page as it will be, for the previews.
  const draft: Page = useMemo(
    () => ({
      ...page,
      title: form.title.trim() || page.title,
      slug,
      seo: {
        ...(form.seoTitle.trim() ? { title: form.seoTitle.trim() } : {}),
        ...(form.seoDescription.trim() ? { description: form.seoDescription.trim() } : {}),
        ...(form.seoImage ? { image: form.seoImage } : {}),
        ...(form.noindex ? { noindex: true } : {}),
      },
    }),
    [page, form, slug],
  );
  // The same SEO check the CLI and Claude use (@openspace/lint), run on the page as edited.
  const seoIssues = useMemo(
    () =>
      sortIssues(
        seoCheck(draft, { ...doc, pages: { ...doc.pages, [page.id]: draft } } as typeof doc),
      ),
    [draft, doc, page.id],
  );

  // Search-check autofixes that set this page's SEO title or description fill the form instead.
  const formFix = (i: Issue): Partial<Record<"seoTitle" | "seoDescription", string>> | null => {
    const op = i.autofix?.ops[0];
    if (i.autofix?.ops.length !== 1 || op?.op !== "page.update" || op.page !== page.id) return null;
    const set = op.set ?? {};
    const out: Partial<Record<"seoTitle" | "seoDescription", string>> = {};
    for (const [k, v] of Object.entries(set)) {
      if (typeof v !== "string") return null;
      if (k === "seo.title") out.seoTitle = v;
      else if (k === "seo.description") out.seoDescription = v;
      else return null;
    }
    return Object.keys(out).length ? out : null;
  };
  const applyFix = (i: Issue) => {
    const fix = formFix(i);
    if (fix) setForm((f) => ({ ...f, ...fix }));
  };

  // Password pages need a password the Hub knows; switching away from one removes it there.
  const wasPassword = Boolean(page.access?.password);
  const passwordError =
    form.access !== "password"
      ? null
      : !designer
        ? wasPassword
          ? null
          : "An owner or designer has to set the password first."
        : passwords.isSuccess && !hasPassword && password.trim().length < 4
          ? "Set a password (at least 4 characters) before saving."
          : null;

  const save = async () => {
    if (slugError || titleError || passwordError) return;
    if (form.access === "password" && designer && password.trim().length >= 4) {
      try {
        await setPw.mutateAsync({ pageId: page.id, password });
        setPassword("");
      } catch (err) {
        toast({
          tone: "danger",
          title: "Couldn’t set the password",
          description: (err as Error).message,
        });
        return;
      }
    }
    // Only owners and designers send page code (the Hub refuses it from everyone else).
    const cmd = updatePageSettings(
      doc,
      page.id,
      designer ? form : { ...form, headCode: undefined, footerCode: undefined },
    );
    const bodies: OpBody[] = [...(cmd?.bodies ?? [])];
    // Navigation visibility (after an unlisted change, which already removed the entry).
    if (!form.unlisted) {
      const nav = doc.site.nav;
      const row = rowForPage(nav, page.id);
      let next = nav;
      if (inNav && !row) next = withPage(nav, page.id);
      else if (row && Boolean(row.item.hidden) === inNav)
        next = updateItem(nav, row.id, (it) => {
          const { hidden: _h, ...rest } = it as typeof it & { hidden?: boolean };
          return (inNav ? rest : { ...it, hidden: true }) as typeof it;
        });
      if (next !== nav) bodies.push({ op: "nav.update", tree: next } as OpBody);
    }
    if (!bodies.length) {
      onClose();
      return;
    }
    const res = api.getState().commit(bodies, { label: cmd?.label ?? `Update “${page.title}”` });
    if (!res.ok) {
      toast({ tone: "danger", title: "Couldn’t save", description: res.errors[0]?.message });
      return;
    }
    if (wasPassword && form.access !== "password" && hasPassword)
      setPw.mutate(
        { pageId: page.id, password: null },
        {
          onError: (err) =>
            toast({
              tone: "danger",
              title: "Couldn’t remove the old password",
              description: err.message,
            }),
        },
      );
    toast({ tone: "success", title: "Page settings saved" });
    onClose();
  };

  const pickImage = () =>
    useManageUi.getState().pickMedia({
      title: "Choose a sharing image",
      onPick: (path) => set("seoImage", path),
    });

  return (
    <form
      className="st-page-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="st-page-form__cols">
        <div className="st-page-form__col">
          <fieldset className="st-fieldset">
            <legend>Page</legend>
            <Field label="Name" error={titleError}>
              <Input
                value={form.title}
                maxLength={120}
                onChange={(e) => set("title", e.target.value)}
                data-autofocus
              />
            </Field>
            <Field
              label="Address"
              error={slugError}
              hint={
                isHome
                  ? "This is your home page; it lives at your main address."
                  : pageUrl(doc, slug)
              }
            >
              <Input
                value={isHome ? "" : form.slug}
                disabled={isHome}
                prefix="/"
                placeholder={isHome ? "(home)" : "about"}
                onChange={(e) => set("slug", e.target.value)}
                onBlur={() => !isHome && set("slug", normalizeSlug(form.slug))}
              />
            </Field>
            {slugChanged && page.slug && (
              <Switch
                id="pg-redirect"
                label={`Send /${page.slug} to the new address`}
                hint="Keeps old links and search results working."
                checked={form.redirectOld}
                onChange={(v) => set("redirectOld", v)}
              />
            )}
          </fieldset>

          <fieldset className="st-fieldset">
            <legend>Visibility</legend>
            <Switch
              id="pg-nav"
              label="Show in navigation"
              hint="List this page in your site's menu."
              checked={inNav}
              disabled={form.unlisted}
              onChange={setInNav}
            />
            {!isHome && (
              <Switch
                id="pg-unlisted"
                label="Unlisted"
                hint="Published, but only people with the link find it: not in menus, site search or the sitemap."
                checked={form.unlisted}
                onChange={(v) => set("unlisted", v)}
              />
            )}
          </fieldset>

          {!isHome && (
            <fieldset className="st-fieldset">
              <legend>Who can see it</legend>
              <Segmented<Access>
                aria-label="Who can see this page"
                block
                value={form.access}
                onValueChange={(v) => set("access", v)}
                options={[
                  { value: "public", label: "Everyone" },
                  { value: "password", label: "Password" },
                  { value: "members", label: "Members" },
                ]}
              />
              {form.access !== "public" && !cloudflare && (
                <div className="st-callout st-callout--pending" role="note">
                  <Cloud aria-hidden="true" />
                  <div>
                    <strong>Needs Cloudflare hosting.</strong> Protected pages are checked by a
                    small program that runs on Cloudflare. Until you switch, this page isn't
                    published.
                    <button
                      type="button"
                      className="st-linklike"
                      onClick={() => {
                        onClose();
                        navigate(`/sites/${site?.id}/settings/hosting`);
                      }}
                    >
                      Switch hosting
                    </button>
                  </div>
                </div>
              )}
              {form.access === "password" &&
                (designer ? (
                  <div className="st-pw">
                    <Field
                      label={hasPassword ? "Change password" : "Password"}
                      error={passwordError}
                      hint={
                        hasPassword
                          ? "A password is set. Visitors type it once per visit."
                          : "Share it with the people who should see this page."
                      }
                    >
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        prefix={<KeyRound aria-hidden="true" />}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                    <Button
                      size="sm"
                      disabled={password.length < 4 || !site}
                      loading={setPw.isPending}
                      icon={<Lock />}
                      onClick={() =>
                        setPw.mutate(
                          { pageId: page.id, password },
                          {
                            onSuccess: () => {
                              setPassword("");
                              toast({ tone: "success", title: "Password set" });
                            },
                            onError: (err) =>
                              toast({
                                tone: "danger",
                                title: "Couldn’t set the password",
                                description: err.message,
                              }),
                          },
                        )
                      }
                    >
                      {hasPassword ? "Update password" : "Set password"}
                    </Button>
                    <p className="st-muted-note">
                      Passwords are kept by OpenSpace, never in your site's files.
                    </p>
                  </div>
                ) : (
                  <p className="st-muted-note" role={passwordError ? "alert" : undefined}>
                    {passwordError ?? "An owner or designer sets the password."}
                  </p>
                ))}
              {form.access === "members" && (
                <p className="st-muted-note">
                  <Users aria-hidden="true" /> Visitors sign in with a link sent to their email.
                  Manage members in Members.
                </p>
              )}
            </fieldset>
          )}
        </div>

        <div className="st-page-form__col">
          <fieldset className="st-fieldset">
            <legend>Search &amp; sharing</legend>
            <Field label="Title in search results" aside={`${(form.seoTitle || "").length}/60`}>
              <Input
                value={form.seoTitle}
                maxLength={120}
                placeholder={draft.slug === "" ? doc.site.title : draft.title}
                onChange={(e) => set("seoTitle", e.target.value)}
              />
            </Field>
            <Field label="Description" aside={`${form.seoDescription.length}/160`}>
              <TextArea
                rows={3}
                maxLength={320}
                value={form.seoDescription}
                placeholder={
                  doc.site.seo?.description ??
                  doc.site.tagline ??
                  "One or two sentences about this page."
                }
                onChange={(e) => set("seoDescription", e.target.value)}
              />
            </Field>
            <div className="st-switch-row">
              <div>
                <span className="st-switch-row__label">Sharing image</span>
                <span className="st-switch-row__hint">
                  Shown when the page is shared on social media.
                </span>
              </div>
              <div className="st-imgpick">
                {form.seoImage && doc.media[form.seoImage as keyof SiteDocument["media"]] ? (
                  <MediaThumb
                    meta={doc.media[form.seoImage as keyof SiteDocument["media"]] as never}
                    className="st-imgpick__thumb"
                  />
                ) : null}
                <Button size="sm" icon={<ImagePlus />} onClick={pickImage}>
                  {form.seoImage ? "Change" : "Choose"}
                </Button>
                {form.seoImage && (
                  <IconButton
                    label="Remove sharing image"
                    icon={<X />}
                    size="sm"
                    onClick={() => set("seoImage", null)}
                  />
                )}
              </div>
            </div>
            <Switch
              id="pg-noindex"
              label="Hide from search engines"
              hint="Asks Google and others not to list this page."
              checked={form.noindex}
              onChange={(v) => set("noindex", v)}
            />
          </fieldset>
          <SeoPreview doc={doc} page={draft} />
          {designer && (
            <details
              className="st-fieldset st-page-code"
              open={Boolean(page.headInjection || page.footerInjection)}
            >
              <summary>Advanced: code on this page</summary>
              <p className="st-muted-note">
                Added only to this page, after your site-wide code. It runs on your published site
                only, never in the editor. A broken or untrusted script can break the page or expose
                your visitors.
              </p>
              <Field
                label="Code in the page head"
                hint="For example a verification or preload tag."
              >
                <TextArea
                  rows={3}
                  spellCheck={false}
                  className="st-code-input"
                  value={form.headCode ?? ""}
                  placeholder={'<link rel="preconnect" href="https://cal.com">'}
                  onChange={(e) => set("headCode", e.target.value)}
                />
              </Field>
              <Field label="Code before </body>" hint="For example a booking or chat widget.">
                <TextArea
                  rows={3}
                  spellCheck={false}
                  className="st-code-input"
                  value={form.footerCode ?? ""}
                  placeholder={'<script src="https://widget.example.com/embed.js" defer></script>'}
                  onChange={(e) => set("footerCode", e.target.value)}
                />
              </Field>
            </details>
          )}
          {seoIssues.length > 0 ? (
            <ul className="st-seo-hints" aria-label="Search check">
              {seoIssues.map((i) => (
                <li key={i.id} className={`is-${i.severity}`}>
                  <span>{i.message}</span> <span className="st-seo-hints__fix">{i.fix}</span>
                  {formFix(i) && (
                    <>
                      {" "}
                      <button type="button" className="st-linklike" onClick={() => applyFix(i)}>
                        {i.autofix?.label}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="st-muted-note">Search check: nothing to fix on this page.</p>
          )}
        </div>
      </div>
      <div className="st-page-form__foot">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={setPw.isPending}
          disabled={Boolean(slugError || titleError || passwordError)}
        >
          Save
        </Button>
      </div>
    </form>
  );
}
