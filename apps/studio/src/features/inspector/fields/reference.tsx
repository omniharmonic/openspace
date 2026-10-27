import {
  type CollectionKind,
  type EmbedFieldMeta,
  type EmbedValue,
  EmbedValueSchema,
  type ReferenceFieldMeta,
  type ReferenceValue,
  type SiteDocument,
  scanForSecrets,
} from "@omniharmonic/openspace-schema";
import { ArrowDown, ArrowUp, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input, NumberScrubInput, Segmented, Select, Toggle } from "../../../ui";
import { PropRow } from "../ui";
import { type ControlProps, useFieldsContext } from "./types";

/** Collections of the allowed kinds, with their labels. */
export function referenceCollections(
  doc: SiteDocument,
  kinds: readonly CollectionKind[],
): Array<{ name: string; label: string; kind: string }> {
  const names = new Set([
    ...Object.keys(doc.collections),
    ...Object.keys(doc.collectionConfigs ?? {}),
  ]);
  const out: Array<{ name: string; label: string; kind: string }> = [];
  for (const name of names) {
    const config = doc.collectionConfigs?.[name];
    const first = Object.values(doc.collections[name] ?? {})[0];
    const kind = config?.kind ?? first?.kind;
    if (!kind || !(kinds as readonly string[]).includes(kind)) continue;
    out.push({ name, label: config?.label ?? name.charAt(0).toUpperCase() + name.slice(1), kind });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

const SORTS: Array<{ value: NonNullable<ReferenceValue["sort"]>; label: string }> = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "title", label: "By title" },
  { value: "manual", label: "As arranged" },
];

/** Reference field: a collection, then either hand-picked items or a filter (FR: summary blocks). */
export function ReferenceControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<ReferenceFieldMeta, ReferenceValue>) {
  const { doc } = useFieldsContext();
  const [error, setError] = useState<string | null>(null);
  const collections = referenceCollections(doc, meta.collectionKinds);
  const commit = (next: ReferenceValue | undefined) =>
    setError(onChange(next, { label: `Change ${label.toLowerCase()}` }));
  if (!collections.length)
    return (
      <p className="st-ip-count">
        Add a {meta.collectionKinds.join(" or ")} collection first; this block lists its items.
      </p>
    );
  const current = value ?? { collection: collections[0]?.name ?? "" };
  const items = Object.values(doc.collections[current.collection] ?? {});
  const picking = current.items !== undefined;
  const kind = collections.find((c) => c.name === current.collection)?.kind;
  const filter = current.filter ?? {};
  const categories = [...new Set(items.flatMap((i) => i.frontmatter.categories ?? []))].sort();
  const setFilter = (patch: Partial<NonNullable<ReferenceValue["filter"]>>) => {
    const f = { ...filter, ...patch } as Record<string, unknown>;
    for (const k of Object.keys(f))
      if (f[k] === undefined || (Array.isArray(f[k]) && !(f[k] as unknown[]).length)) delete f[k];
    const next = { ...current };
    if (Object.keys(f).length) next.filter = f as ReferenceValue["filter"];
    else delete next.filter;
    commit(next);
  };
  return (
    <div className="st-ip-ref">
      <PropRow label="Collection">
        <Select<string>
          aria-label="Collection"
          size="sm"
          value={current.collection}
          disabled={disabled}
          onValueChange={(c) =>
            commit({ collection: c, ...(current.limit ? { limit: current.limit } : {}) })
          }
          options={collections.map((c) => ({ value: c.name, label: c.label }))}
        />
      </PropRow>
      <PropRow label="Show">
        <Segmented<"filter" | "pick">
          disabled={disabled}
          aria-label="Which items"
          size="sm"
          block
          value={picking ? "pick" : "filter"}
          onValueChange={(m) => {
            const next = { ...current };
            if (m === "pick") {
              next.items = items.slice(0, Math.min(3, meta.maxItems ?? 3)).map((i) => i.slug);
              delete next.filter;
            } else delete next.items;
            commit(next);
          }}
          options={[
            { value: "filter", label: "Latest" },
            { value: "pick", label: "Hand-picked" },
          ]}
        />
      </PropRow>
      {picking ? (
        <ul className="st-ip-choices" aria-label="Items to show">
          {items.map((it) => {
            const order = current.items ?? [];
            const at = order.indexOf(it.slug);
            const on = at >= 0;
            const full = meta.maxItems !== undefined && order.length >= meta.maxItems && !on;
            return (
              <li key={it.slug} className="st-ip-refitem">
                <label className="st-ip-choice">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled || full}
                    onChange={() =>
                      commit({
                        ...current,
                        items: on ? order.filter((s) => s !== it.slug) : [...order, it.slug],
                      })
                    }
                  />
                  {it.frontmatter.title}
                  {on && <span className="st-ip-choice__meta">{at + 1}</span>}
                </label>
                {on && (
                  <span className="st-ip-refitem__move">
                    <button
                      type="button"
                      className="st-ip-icon-btn"
                      aria-label={`Move ${it.frontmatter.title} up`}
                      disabled={disabled || at === 0}
                      onClick={() => {
                        const o = [...order];
                        [o[at - 1], o[at]] = [o[at] as string, o[at - 1] as string];
                        commit({ ...current, items: o });
                      }}
                    >
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="st-ip-icon-btn"
                      aria-label={`Move ${it.frontmatter.title} down`}
                      disabled={disabled || at === order.length - 1}
                      onClick={() => {
                        const o = [...order];
                        [o[at + 1], o[at]] = [o[at] as string, o[at + 1] as string];
                        commit({ ...current, items: o });
                      }}
                    >
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {categories.length > 0 && (
            <PropRow label="Category">
              <Select<string>
                aria-label="Category"
                size="sm"
                value={filter.categories?.[0] ?? "__all"}
                disabled={disabled}
                onValueChange={(c) => setFilter({ categories: c === "__all" ? undefined : [c] })}
                options={[
                  { value: "__all", label: "All categories" },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
            </PropRow>
          )}
          <PropRow label="Tags" htmlFor={`${id}-tags`} hint="Separate tags with commas.">
            <Input
              id={`${id}-tags`}
              size="sm"
              key={(filter.tags ?? []).join(",")}
              defaultValue={(filter.tags ?? []).join(", ")}
              disabled={disabled}
              onBlur={(e) => {
                const tags = e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 40);
                if (tags.join(",") !== (filter.tags ?? []).join(","))
                  setFilter({ tags: tags.length ? tags : undefined });
              }}
            />
          </PropRow>
          <PropRow label="Featured only" htmlFor={`${id}-featured`}>
            <div className="st-ip-fixed">
              <Toggle
                id={`${id}-featured`}
                size="sm"
                checked={filter.featured === true}
                disabled={disabled}
                onCheckedChange={(c) => setFilter({ featured: c ? true : undefined })}
              />
            </div>
          </PropRow>
          {kind === "events" && (
            <PropRow label="Upcoming only" htmlFor={`${id}-upcoming`}>
              <div className="st-ip-fixed">
                <Toggle
                  id={`${id}-upcoming`}
                  size="sm"
                  checked={filter.upcoming === true}
                  disabled={disabled}
                  onCheckedChange={(c) => setFilter({ upcoming: c ? true : undefined })}
                />
              </div>
            </PropRow>
          )}
          <PropRow label="Order">
            <Select<string>
              aria-label="Order"
              size="sm"
              value={current.sort ?? "date-desc"}
              disabled={disabled}
              onValueChange={(s) => commit({ ...current, sort: s as ReferenceValue["sort"] })}
              options={SORTS}
            />
          </PropRow>
          <PropRow label="How many">
            <NumberScrubInput
              label="How many"
              value={current.limit ?? null}
              mixedLabel="All"
              min={1}
              max={100}
              disabled={disabled}
              onChange={(n) => commit({ ...current, limit: Math.round(n) })}
            />
          </PropRow>
        </>
      )}
      {error && (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export type EmbedCheck = { ok: true; value: EmbedValue } | { ok: false; message: string };

/**
 * Embed values are sanitized before they are saved: URLs must be https; code is trimmed,
 * size-limited, and refused when it carries something that looks like a secret key (it is
 * published in the open). Code always runs in a sandboxed frame, on the canvas and the site.
 */
export function checkEmbed(candidate: EmbedValue, allow: readonly ("url" | "code")[]): EmbedCheck {
  if (!allow.includes(candidate.type))
    return { ok: false, message: "That kind of embed isn’t allowed here." };
  const value: EmbedValue =
    candidate.type === "url"
      ? { type: "url", url: candidate.url.trim() }
      : { type: "code", code: candidate.code.replace(/\r\n/g, "\n").trim() };
  if (value.type === "code") {
    if (!value.code) return { ok: false, message: "Paste the embed code." };
    const secrets = scanForSecrets(value.code);
    if (secrets.length)
      return {
        ok: false,
        message:
          "This code contains what looks like a private key. Remove it — everything here is published.",
      };
  }
  const parsed = EmbedValueSchema.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      message:
        value.type === "url"
          ? "Use a full https:// address."
          : "The code is too long to embed (50,000 characters at most).",
    };
  return { ok: true, value: parsed.data };
}

export function EmbedControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<EmbedFieldMeta, EmbedValue>) {
  const [mode, setMode] = useState<"url" | "code">(value?.type ?? meta.allow[0] ?? "url");
  const [draft, setDraft] = useState(
    value?.type === "url" ? value.url : value?.type === "code" ? value.code : "",
  );
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  // Follow outside changes (undo, collaborators) while the field isn't being edited.
  useEffect(() => {
    if (focused.current) return;
    if (value) setMode(value.type);
    setDraft(value?.type === "url" ? value.url : value?.type === "code" ? value.code : "");
  }, [value]);
  /** Enter applies but keeps editing; leaving the field (blur) hands it back to outside changes. */
  const apply = (leaving = false) => {
    if (leaving) focused.current = false;
    const candidate: EmbedValue =
      mode === "url" ? { type: "url", url: draft } : { type: "code", code: draft };
    const r = checkEmbed(candidate, meta.allow);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setError(onChange(r.value, { label: `Change ${label.toLowerCase()}` }));
  };
  return (
    <div className="st-ip-embed">
      {meta.allow.length > 1 && (
        <Segmented<"url" | "code">
          disabled={disabled}
          aria-label="Embed from"
          size="sm"
          block
          value={mode}
          onValueChange={(m) => {
            setMode(m);
            setDraft("");
            setError(null);
          }}
          options={[
            { value: "url", label: "Address" },
            { value: "code", label: "Code" },
          ]}
        />
      )}
      {mode === "url" ? (
        <Input
          id={id}
          size="sm"
          aria-label={`${label} address`}
          placeholder="https://"
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => apply(true)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
      ) : (
        <textarea
          id={id}
          className="st-ip-textarea st-ip-textarea--code"
          aria-label={`${label} code`}
          spellCheck={false}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => apply(true)}
        />
      )}
      <p className="st-ip-row__hint">
        <ShieldAlert aria-hidden="true" className="st-ip-inline-icon" /> Runs in a sealed frame, so
        it can’t reach the rest of your site.
      </p>
      {error && (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
