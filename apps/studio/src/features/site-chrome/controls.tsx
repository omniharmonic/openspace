import type { OpBody } from "@omniharmonic/openspace-ops";
import { compiledStylesFor } from "@omniharmonic/openspace-renderer";
import {
  COLOR_THEMES,
  type ColorTheme,
  type Link,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { ImagePlus, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Button, cx, IconButton, Input, Select, Toggle, Tooltip, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { THEME_LABEL } from "../editor/model/themes";
import { MediaThumb } from "../media/MediaLibrary";
import { useManageUi } from "../site-mgmt/manage-ui";

/** Commit a `site.update` (grouping rapid edits of the same field into one undo step). */
export function useSiteUpdate() {
  const api = useDocStoreApi();
  return (
    label: string,
    patch: { set?: Record<string, unknown>; unset?: string[] },
    mergeKey?: string,
  ): boolean => {
    const body = {
      op: "site.update",
      ...(patch.set && Object.keys(patch.set).length ? { set: patch.set } : {}),
      ...(patch.unset?.length ? { unset: patch.unset } : {}),
    } as OpBody;
    const res = api.getState().commit([body], { label, ...(mergeKey ? { mergeKey } : {}) });
    if (!res.ok)
      toast({
        tone: "danger",
        title: "That change didn’t work",
        description: res.errors[0]?.message,
      });
    return res.ok;
  };
}

/** A labelled switch row. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="st-switch-row">
      <div>
        <span className="st-switch-row__label">{label}</span>
        {hint && <span className="st-switch-row__hint">{hint}</span>}
      </div>
      <Toggle checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

/** Five color-theme swatches rendered from the site's own compiled palette. */
export function ThemePicker({
  value,
  onChange,
  label = "Color theme",
}: {
  value: ColorTheme | undefined;
  onChange: (t: ColorTheme) => void;
  label?: string;
}) {
  const styles = useDocStore((s) => s.doc.styles);
  const themes = useMemo(() => compiledStylesFor(styles).tokens.themes, [styles]);
  return (
    <fieldset className="st-themes">
      <legend className="st-visually-hidden">{label}</legend>
      {COLOR_THEMES.map((t) => {
        const c = themes[t] as unknown as Record<string, string>;
        return (
          <Tooltip key={t} content={THEME_LABEL[t]}>
            <button
              type="button"
              className={cx("st-themes__swatch", value === t && "is-selected")}
              aria-pressed={value === t}
              aria-label={THEME_LABEL[t]}
              style={{ background: c.background, color: c.text }}
              onClick={() => onChange(t)}
            >
              <span style={{ background: c.accent }} />
              Aa
            </button>
          </Tooltip>
        );
      })}
    </fieldset>
  );
}

type LinkKind = "page" | "section" | "url" | "email" | "phone";

const kindOf = (v: Link | undefined): LinkKind =>
  v?.type === "url" || v?.type === "email" || v?.type === "phone"
    ? v.type
    : v?.type === "anchor" || (v?.type === "page" && v.anchor)
      ? "section"
      : "page";

/** The page and section a section link points at (`{type:"anchor"}` or a page with an anchor). */
function sectionOf(doc: SiteDocument, v: Link | undefined): { page?: string; section?: string } {
  if (v?.type === "anchor") {
    const page = Object.values(doc.pages).find((p) => p.sections.some((s) => s.id === v.section));
    return { ...(page ? { page: page.id } : {}), section: v.section };
  }
  if (v?.type === "page") {
    const page = doc.pages[v.page];
    const s = v.anchor ? page?.sections.find((x) => (x.anchor ?? x.id) === v.anchor) : undefined;
    return { page: v.page, ...(s ? { section: s.id } : {}) };
  }
  return {};
}
const textOf = (v: Link | undefined): string =>
  v?.type === "url" ? v.url : v?.type === "email" ? v.email : v?.type === "phone" ? v.phone : "";

/** Turn typed text into a link of the given kind (null when it's empty). */
export function linkFromText(
  kind: Exclude<LinkKind, "page" | "section">,
  raw: string,
): Link | null {
  const v = raw.trim();
  if (!v) return null;
  if (kind === "url") return { type: "url", url: /^(https?:\/\/|\/)/.test(v) ? v : `https://${v}` };
  if (kind === "email") return { type: "email", email: v.replace(/^mailto:/, "") };
  return { type: "phone", phone: v.replace(/^tel:/, "") };
}

/** A compact link editor: a page on the site, a web address, an email or a phone number. */
export function LinkField({
  value,
  onChange,
  doc,
  label = "Link to",
}: {
  value: Link | undefined;
  onChange: (link: Link) => void;
  doc: SiteDocument;
  label?: string;
}) {
  const [kind, setKind] = useState<LinkKind>(() => kindOf(value));
  const [text, setText] = useState(() => textOf(value));
  useEffect(() => {
    if (!value) return;
    setKind(kindOf(value));
    setText(textOf(value));
  }, [value]);
  const pages = Object.values(doc.pages);
  const [sectionPage, setSectionPage] = useState<string | undefined>(
    () => sectionOf(doc, value).page,
  );
  const target = sectionOf(doc, value);
  const sPage = doc.pages[(sectionPage ?? target.page ?? "") as keyof SiteDocument["pages"]];
  const commitText = () => {
    if (kind === "page" || kind === "section") return;
    const link = linkFromText(kind, text);
    if (link) onChange(link);
  };
  return (
    <div className="st-linkfield">
      <Select<LinkKind>
        aria-label={label}
        size="sm"
        value={kind}
        onValueChange={(k) => {
          setKind(k);
          if (k === "page") {
            const first = pages[0];
            if (first) onChange({ type: "page", page: first.id });
          } else if (k === "section")
            setSectionPage((pages.find((p) => p.slug === "") ?? pages[0])?.id);
          else setText("");
        }}
        options={[
          { value: "page", label: "Page" },
          { value: "section", label: "Section" },
          { value: "url", label: "Web address" },
          { value: "email", label: "Email" },
          { value: "phone", label: "Phone" },
        ]}
      />
      {kind === "section" ? (
        <>
          <Select
            aria-label="Page"
            size="sm"
            value={sPage?.id}
            placeholder="Choose a page"
            onValueChange={setSectionPage}
            options={pages.map((p) => ({ value: p.id, label: p.title }))}
          />
          <Select
            aria-label="Section"
            size="sm"
            value={target.page === sPage?.id ? target.section : undefined}
            placeholder="Choose a section"
            onValueChange={(id) => {
              const s = sPage?.sections.find((x) => x.id === id);
              if (!sPage || !s) return;
              // A named section keeps a readable address (/#prices); else follow it by id.
              onChange(
                s.anchor
                  ? { type: "page", page: sPage.id, anchor: s.anchor }
                  : { type: "anchor", section: s.id },
              );
            }}
            options={(sPage?.sections ?? []).map((s, i) => ({
              value: s.id,
              label: s.label ?? (s.anchor ? `#${s.anchor}` : `Section ${i + 1}`),
            }))}
          />
        </>
      ) : kind === "page" ? (
        <Select
          aria-label="Page"
          size="sm"
          value={value?.type === "page" ? value.page : undefined}
          placeholder="Choose a page"
          onValueChange={(page) => onChange({ type: "page", page: page as never })}
          options={pages.map((p) => ({ value: p.id, label: p.title }))}
        />
      ) : (
        <Input
          size="sm"
          aria-label={
            kind === "email" ? "Email address" : kind === "phone" ? "Phone number" : "Web address"
          }
          value={text}
          inputMode={kind === "email" ? "email" : kind === "phone" ? "tel" : "url"}
          placeholder={
            kind === "email" ? "hello@example.com" : kind === "phone" ? "+1 555 0100" : "https://"
          }
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            }
          }}
        />
      )}
    </div>
  );
}

/** Pick an image from the media library (or clear it). */
export function ImagePick({
  value,
  onChange,
  title,
  clearLabel = "Remove image",
}: {
  value: string | null | undefined;
  onChange: (path: string | null) => void;
  title: string;
  clearLabel?: string;
}) {
  const media = useDocStore((s) =>
    value ? s.doc.media[value as keyof SiteDocument["media"]] : undefined,
  );
  return (
    <div className="st-imgpick">
      {media && <MediaThumb meta={media} className="st-imgpick__thumb" />}
      <Button
        size="sm"
        icon={<ImagePlus />}
        onClick={() => useManageUi.getState().pickMedia({ title, onPick: (p) => onChange(p) })}
      >
        {value ? "Change" : "Choose"}
      </Button>
      {value && (
        <IconButton label={clearLabel} icon={<X />} size="sm" onClick={() => onChange(null)} />
      )}
    </div>
  );
}
