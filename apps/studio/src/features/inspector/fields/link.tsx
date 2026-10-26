import type { Link, LinkFieldMeta, SiteDocument } from "@openspace/schema";
import {
  AtSign,
  ChevronDown,
  FileText,
  Hash,
  Link2,
  type LucideIcon,
  Newspaper,
  Paperclip,
  Phone,
} from "lucide-react";
import { useId, useState } from "react";
import { Button, Input, Select, Toggle } from "../../../ui";
import { useOpenMediaPicker } from "../media";
import {
  checkLink,
  describeLink,
  LINK_TYPE_LABEL,
  LINK_TYPES,
  normaliseUrl,
  sectionTargets,
} from "../model/link";
import { PropRow } from "../ui";
import { type ControlProps, useFieldsContext } from "./types";

const ICON: Record<Link["type"], LucideIcon> = {
  page: FileText,
  item: Newspaper,
  url: Link2,
  email: AtSign,
  phone: Phone,
  file: Paperclip,
  anchor: Hash,
};

type Commit = (link: unknown) => string | null;

function PageTarget({
  doc,
  link,
  commit,
}: {
  doc: SiteDocument;
  link: Extract<Link, { type: "page" }> | undefined;
  commit: Commit;
}) {
  const [q, setQ] = useState("");
  const pages = Object.values(doc.pages).filter((p) =>
    `${p.title} /${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const targets = link ? sectionTargets(doc, link.page) : [];
  return (
    <>
      <Input
        size="sm"
        aria-label="Find a page"
        placeholder="Find a page"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="st-ip-choices" aria-label="Pages">
        {pages.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="st-ip-choice"
              aria-pressed={link?.page === p.id}
              onClick={() => commit({ type: "page", page: p.id })}
            >
              <FileText aria-hidden="true" />
              {p.title}
              <span className="st-ip-choice__meta">/{p.slug}</span>
            </button>
          </li>
        ))}
        {!pages.length && <li className="st-ip-count">No pages match.</li>}
      </ul>
      {link && targets.length > 0 && (
        <PropRow label="Jump to">
          <Select<string>
            aria-label="Jump to a section"
            size="sm"
            value={link.anchor ?? "__top"}
            onValueChange={(v) =>
              commit(
                v === "__top"
                  ? { type: "page", page: link.page }
                  : { type: "page", page: link.page, anchor: v },
              )
            }
            options={[
              { value: "__top", label: "Top of the page" },
              ...targets.map((t) => ({ value: t.fragment, label: t.label })),
            ]}
          />
        </PropRow>
      )}
    </>
  );
}

function ItemTarget({
  doc,
  link,
  commit,
}: {
  doc: SiteDocument;
  link: Extract<Link, { type: "item" }> | undefined;
  commit: Commit;
}) {
  const names = Object.keys(doc.collections);
  const [collection, setCollection] = useState(link?.collection ?? names[0]);
  if (!names.length)
    return <p className="st-ip-count">This site has no blog posts, events or products yet.</p>;
  const items = Object.values(doc.collections[collection ?? ""] ?? {});
  return (
    <>
      <Select<string>
        aria-label="Collection"
        size="sm"
        value={collection}
        onValueChange={setCollection}
        options={names.map((n) => ({ value: n, label: doc.collectionConfigs?.[n]?.label ?? n }))}
      />
      <ul className="st-ip-choices" aria-label="Items">
        {items.map((it) => (
          <li key={it.slug}>
            <button
              type="button"
              className="st-ip-choice"
              aria-pressed={link?.collection === collection && link?.slug === it.slug}
              onClick={() => commit({ type: "item", collection, slug: it.slug })}
            >
              {it.frontmatter.title}
              <span className="st-ip-choice__meta">
                {it.frontmatter.status === "draft" ? "Draft" : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function TextTarget({
  label,
  initial,
  placeholder,
  build,
  commit,
  inputType = "text",
}: {
  label: string;
  initial: string;
  placeholder: string;
  build: (v: string) => unknown;
  commit: Commit;
  inputType?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    if (draft.trim() === initial) return;
    setError(commit(build(draft)));
  };
  return (
    <PropRow label={label} stacked>
      <Input
        size="sm"
        aria-label={label}
        type={inputType}
        value={draft}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={apply}
        onKeyDown={(e) => e.key === "Enter" && apply()}
      />
    </PropRow>
  );
}

/**
 * Link picker: pages (with an optional section to jump to), collection items, web addresses,
 * email, phone, files and sections on this page — limited to what the field allows.
 */
export function LinkControl({
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<LinkFieldMeta, Link>) {
  const { doc, pageId } = useFieldsContext();
  const open = useOpenMediaPicker();
  const allowed = LINK_TYPES.filter((t) => meta.allow.includes(t));
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<Link["type"]>(value?.type ?? allowed[0] ?? "url");
  const [error, setError] = useState<string | null>(null);
  const tabId = useId();
  const commit: Commit = (candidate) => {
    const r = checkLink(candidate, meta.allow);
    if (!r.ok) {
      setError(r.message);
      return r.message;
    }
    const e = onChange(r.link, { label: `Change ${label.toLowerCase()}` });
    setError(e);
    return e;
  };
  const Icon = value ? ICON[value.type] : Link2;
  const v = value?.type === type ? value : undefined;
  const sameTab = (l: Link | undefined) =>
    l && (l.type === "url" || l.type === "file") ? (
      <PropRow label="New tab" htmlFor={tabId}>
        <div className="st-ip-fixed">
          <Toggle
            id={tabId}
            size="sm"
            checked={l.newTab === true}
            onCheckedChange={(c) => {
              const next = { ...l } as typeof l;
              if (c) next.newTab = true;
              else delete next.newTab;
              commit(next);
            }}
          />
        </div>
      </PropRow>
    ) : null;

  return (
    <div className="st-ip-link">
      <button
        type="button"
        className="st-ip-link__summary"
        aria-expanded={expanded}
        aria-label={`${label}: ${describeLink(doc, value)}`}
        disabled={disabled}
        onClick={() => setExpanded((x) => !x)}
      >
        <Icon aria-hidden="true" />
        <span>{describeLink(doc, value)}</span>
        <ChevronDown aria-hidden="true" style={{ marginLeft: "auto" }} />
      </button>
      {expanded && !disabled && (
        <div className="st-ip-link__editor">
          {allowed.length > 1 && (
            <Select<Link["type"]>
              aria-label="Link to"
              size="sm"
              value={type}
              onValueChange={(t) => {
                setType(t);
                setError(null);
              }}
              options={allowed.map((t) => ({ value: t, label: LINK_TYPE_LABEL[t] }))}
            />
          )}
          {type === "page" && <PageTarget doc={doc} link={v as never} commit={commit} />}
          {type === "item" && <ItemTarget doc={doc} link={v as never} commit={commit} />}
          {type === "url" && (
            <TextTarget
              key={`url:${(v as Extract<Link, { type: "url" }> | undefined)?.url ?? ""}`}
              label="Address"
              placeholder="https://example.com or /about"
              initial={(v as Extract<Link, { type: "url" }> | undefined)?.url ?? ""}
              build={(s) => ({
                type: "url",
                url: normaliseUrl(s),
                ...(v && "newTab" in v && v.newTab ? { newTab: true } : {}),
              })}
              commit={commit}
            />
          )}
          {type === "email" && (
            <>
              <TextTarget
                key={`email:${(v as Extract<Link, { type: "email" }> | undefined)?.email ?? ""}`}
                label="Email address"
                inputType="email"
                placeholder="hello@example.com"
                initial={(v as Extract<Link, { type: "email" }> | undefined)?.email ?? ""}
                build={(s) => ({
                  ...(v ?? {}),
                  type: "email",
                  email: s.trim().replace(/^mailto:/i, ""),
                })}
                commit={commit}
              />
              {v && (
                <TextTarget
                  key={`subject:${(v as Extract<Link, { type: "email" }>).subject ?? ""}`}
                  label="Subject (optional)"
                  placeholder="Hello from your site"
                  initial={(v as Extract<Link, { type: "email" }>).subject ?? ""}
                  build={(s) => {
                    const { subject: _s, ...rest } = v as Extract<Link, { type: "email" }>;
                    return s.trim() ? { ...rest, subject: s.trim() } : rest;
                  }}
                  commit={commit}
                />
              )}
            </>
          )}
          {type === "phone" && (
            <TextTarget
              key={`phone:${(v as Extract<Link, { type: "phone" }> | undefined)?.phone ?? ""}`}
              label="Phone number"
              inputType="tel"
              placeholder="+1 555 010 2030"
              initial={(v as Extract<Link, { type: "phone" }> | undefined)?.phone ?? ""}
              build={(s) => ({ type: "phone", phone: s.trim().replace(/^tel:/i, "") })}
              commit={commit}
            />
          )}
          {type === "file" && (
            <div className="st-ip-btnrow">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const pick = await open({ accept: "file", title: "Choose a file" });
                  if (pick) commit({ type: "file", src: pick.src });
                }}
              >
                {v ? "Replace file" : "Choose file"}
              </Button>
            </div>
          )}
          {type === "anchor" && (
            <ul className="st-ip-choices" aria-label="Sections on this page">
              {sectionTargets(doc, pageId).map((t) => (
                <li key={t.section.id}>
                  <button
                    type="button"
                    className="st-ip-choice"
                    aria-pressed={v?.type === "anchor" && v.section === t.section.id}
                    onClick={() => commit({ type: "anchor", section: t.section.id })}
                  >
                    <Hash aria-hidden="true" />
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {sameTab(v)}
          {error && (
            <p className="st-ip-row__error" role="alert">
              {error}
            </p>
          )}
          {value && meta.optional && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(undefined, { label: "Remove link" })}
            >
              Remove link
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
