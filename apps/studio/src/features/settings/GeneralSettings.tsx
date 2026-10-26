import { LocaleSchema, type SiteDocument } from "@openspace/schema";
import { useState } from "react";
import { useRenameSite } from "../../api";
import type { Site } from "../../api/types";
import { Button, Field, Input, Select, TextArea, toast } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { SeoPreview } from "../pages/SeoPreview";
import { ImagePick, useSiteUpdate } from "../site-chrome/controls";
import { can } from "../site-mgmt/manage-ui";

export const LOCALES: Array<{ value: string; label: string }> = [
  { value: "en", label: "English" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "nl", label: "Nederlands" },
  { value: "sv", label: "Svenska" },
  { value: "da", label: "Dansk" },
  { value: "nb", label: "Norsk bokmål" },
  { value: "fi", label: "Suomi" },
  { value: "pl", label: "Polski" },
  { value: "cs", label: "Čeština" },
  { value: "tr", label: "Türkçe" },
  { value: "el", label: "Ελληνικά" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh-Hans", label: "中文（简体）" },
  { value: "zh-Hant", label: "中文（繁體）" },
  { value: "other", label: "Other…" },
];

/** General: name, tagline, logo, browser icon, language and search defaults. */
export function GeneralSettings({ site }: { site: Site }) {
  const doc = useDocStore((s) => s.doc);
  const update = useSiteUpdate();
  const rename = useRenameSite(site.id);
  const editable = can(site, "editor");
  const [name, setName] = useState(doc.site.title);
  const [tagline, setTagline] = useState(doc.site.tagline ?? "");
  const known = LOCALES.some((l) => l.value === doc.site.locale);
  const [localeChoice, setLocaleChoice] = useState(known ? doc.site.locale : "other");
  const [customLocale, setCustomLocale] = useState(known ? "" : doc.site.locale);
  const [titleTemplate, setTitleTemplate] = useState(doc.site.seo?.titleTemplate ?? "");
  const [description, setDescription] = useState(doc.site.seo?.description ?? "");

  const locale = localeChoice === "other" ? customLocale.trim() : localeChoice;
  const localeError =
    locale && !LocaleSchema.safeParse(locale).success
      ? "Use a language code like en or pt-BR."
      : undefined;
  const nameError = name.trim() ? undefined : "Your site needs a name.";
  const templateError =
    titleTemplate && !titleTemplate.includes("%s")
      ? "Include %s where the page name goes."
      : undefined;

  const dirty =
    name.trim() !== doc.site.title ||
    tagline.trim() !== (doc.site.tagline ?? "") ||
    locale !== doc.site.locale ||
    titleTemplate.trim() !== (doc.site.seo?.titleTemplate ?? "") ||
    description.trim() !== (doc.site.seo?.description ?? "");

  const save = () => {
    if (nameError || localeError || templateError) return;
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    if (name.trim() !== doc.site.title) set.title = name.trim();
    if (tagline.trim() !== (doc.site.tagline ?? "")) {
      if (tagline.trim()) set.tagline = tagline.trim();
      else unset.push("tagline");
    }
    if (locale !== doc.site.locale) set.locale = locale;
    const seo = {
      ...(doc.site.seo ?? {}),
      ...(titleTemplate.trim()
        ? { titleTemplate: titleTemplate.trim() }
        : { titleTemplate: undefined }),
      ...(description.trim() ? { description: description.trim() } : { description: undefined }),
    };
    const cleanSeo = Object.fromEntries(Object.entries(seo).filter(([, v]) => v !== undefined));
    if (
      titleTemplate.trim() !== (doc.site.seo?.titleTemplate ?? "") ||
      description.trim() !== (doc.site.seo?.description ?? "")
    ) {
      if (Object.keys(cleanSeo).length) set.seo = cleanSeo;
      else unset.push("seo");
    }
    if (!update("Site details", { set, unset })) return;
    if (name.trim() !== site.name) {
      rename.mutate(name.trim(), {
        onError: (err) =>
          toast({
            tone: "danger",
            title: "Saved on the page, but the name in your dashboard didn’t change",
            description: err.message,
          }),
      });
    }
    toast({ tone: "success", title: "Settings saved" });
  };

  const home = Object.values(doc.pages).find((p) => p.slug === "");

  return (
    <div className="st-settings__stack">
      <form
        className="st-card"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <fieldset className="st-fieldset" disabled={!editable}>
          <legend>Site</legend>
          <Field label="Site name" error={nameError}>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Tagline" hint="A short line that appears with your name in search results.">
            <Input value={tagline} maxLength={200} onChange={(e) => setTagline(e.target.value)} />
          </Field>
          <Field
            label="Language"
            hint="Helps browsers, screen readers and search engines."
            error={localeError}
          >
            <Select
              value={localeChoice}
              onValueChange={setLocaleChoice}
              options={LOCALES}
              aria-label="Language"
            />
          </Field>
          {localeChoice === "other" && (
            <Field label="Language code" error={localeError}>
              <Input
                value={customLocale}
                placeholder="e.g. ca or es-MX"
                onChange={(e) => setCustomLocale(e.target.value)}
              />
            </Field>
          )}
        </fieldset>
        <fieldset className="st-fieldset" disabled={!editable}>
          <legend>Search results</legend>
          <Field
            label="Page title pattern"
            hint="%s is replaced by each page's name, e.g. “Classes — Maya Yoga”."
            error={templateError}
          >
            <Input
              value={titleTemplate}
              placeholder={`%s — ${doc.site.title}`}
              maxLength={120}
              onChange={(e) => setTitleTemplate(e.target.value)}
            />
          </Field>
          <Field label="Default description" aside={`${description.length}/160`}>
            <TextArea
              rows={2}
              maxLength={320}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </fieldset>
        {editable && (
          <div className="st-row-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={!dirty || Boolean(nameError || localeError || templateError)}
              loading={rename.isPending}
            >
              Save
            </Button>
          </div>
        )}
      </form>

      <div className="st-card">
        <fieldset className="st-fieldset" disabled={!editable}>
          <legend>Brand</legend>
          <div className="st-switch-row">
            <div>
              <span className="st-switch-row__label">Logo</span>
              <span className="st-switch-row__hint">
                Shown in your header. SVG or PNG with a clear background works best.
              </span>
            </div>
            <ImagePick
              title="Choose your logo"
              value={doc.site.logo?.src}
              onChange={(src) => {
                if (!src) return void update("Remove logo", { set: { logo: null } });
                const meta = doc.media[src as keyof SiteDocument["media"]];
                update("Change logo", {
                  set: {
                    logo: {
                      src,
                      alt: doc.site.logo?.alt || doc.site.title,
                      ...(meta?.width && meta.height
                        ? { width: meta.width, height: meta.height }
                        : {}),
                    },
                  },
                });
              }}
            />
          </div>
          <div className="st-switch-row">
            <div>
              <span className="st-switch-row__label">Browser tab icon</span>
              <span className="st-switch-row__hint">A square image, at least 512 × 512.</span>
            </div>
            <ImagePick
              title="Choose a browser tab icon"
              value={doc.site.favicon ?? null}
              onChange={(src) =>
                update(src ? "Change browser tab icon" : "Remove browser tab icon", {
                  set: { favicon: src },
                })
              }
            />
          </div>
          <div className="st-switch-row">
            <div>
              <span className="st-switch-row__label">Default sharing image</span>
              <span className="st-switch-row__hint">Used when a page doesn't have its own.</span>
            </div>
            <ImagePick
              title="Choose a sharing image"
              value={doc.site.seo?.image ?? null}
              onChange={(src) =>
                update(
                  "Default sharing image",
                  src
                    ? { set: { "seo.image": src } }
                    : doc.site.seo && Object.keys(doc.site.seo).length > 1
                      ? { unset: ["seo.image"] }
                      : { unset: ["seo"] },
                )
              }
            />
          </div>
        </fieldset>
      </div>

      {home && (
        <div className="st-card">
          <SeoPreview doc={doc} page={home} />
        </div>
      )}
    </div>
  );
}
