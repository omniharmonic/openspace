import type { FieldMeta, ImageValue, Link, RichTextDoc } from "@omniharmonic/openspace-schema";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Field, IconButton, Input, Select, TextArea } from "../../ui";
import { SwitchRow } from "../workspace/ui";
import { MediaField } from "./fields";
import { ProseEditor } from "./ProseEditor";
import "./collections.css";

/**
 * A plain form for a block's fields, driven by the block's field metadata: text, rich text,
 * images, media, links, choices, switches, numbers and lists of those. Used for the blocks in a
 * post body and in emails.
 */

type Fields = Record<string, unknown>;

function linkToText(v: unknown): string {
  if (!v || typeof v !== "object") return typeof v === "string" ? v : "";
  const l = v as Link & Record<string, string>;
  switch (l.type) {
    case "url":
      return l.url ?? "";
    case "email":
      return `mailto:${l.email ?? ""}`;
    case "phone":
      return `tel:${l.phone ?? ""}`;
    case "file":
      return l.src ?? "";
    default:
      return "";
  }
}

function textToLink(text: string, allow: string[]): Link | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (t.startsWith("mailto:") && allow.includes("email"))
    return { type: "email", email: t.slice(7) } as Link;
  if (t.startsWith("tel:") && allow.includes("phone"))
    return { type: "phone", phone: t.slice(4) } as Link;
  if (t.startsWith("media/") && allow.includes("file")) return { type: "file", src: t } as Link;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && allow.includes("email"))
    return { type: "email", email: t } as Link;
  const url = /^https?:\/\//.test(t) || t.startsWith("/") ? t : `https://${t}`;
  return { type: "url", url } as Link;
}

function label(key: string, meta: FieldMeta): string {
  if (meta.label) return meta.label;
  const s = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Fields worth showing here (colors and site-level references live in the page editor). */
const SKIP = new Set(["color", "reference", "form", "embed"]);

export function FieldControl({
  name,
  meta,
  value,
  onChange,
}: {
  name: string;
  meta: FieldMeta;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const text = label(name, meta);
  switch (meta.kind) {
    case "text":
      return (
        <Field label={text} hint={meta.help}>
          {meta.multiline ? (
            <TextArea
              rows={3}
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value || (meta.optional ? undefined : ""))}
            />
          ) : (
            <Input
              value={String(value ?? "")}
              maxLength={meta.maxLength}
              placeholder={meta.placeholder}
              onChange={(e) => onChange(e.target.value || (meta.optional ? undefined : ""))}
            />
          )}
        </Field>
      );
    case "richText":
      return (
        <div className="st-field-block">
          <span className="st-field-block__label">{text}</span>
          <ProseEditor
            label={text}
            minimal
            value={value as RichTextDoc | undefined}
            onChange={(doc) => onChange(doc)}
          />
        </div>
      );
    case "image": {
      const img = value as ImageValue | undefined;
      return (
        <div className="st-ws-cols">
          <MediaField
            label={text}
            value={img?.src}
            onChange={(src) =>
              onChange(
                src
                  ? { ...(img ?? {}), src, alt: img?.alt ?? "" }
                  : meta.optional
                    ? undefined
                    : img,
              )
            }
          />
          <Field label="Image description" hint="Describe it for people who can't see it.">
            <Input
              value={img?.alt ?? ""}
              disabled={!img}
              onChange={(e) => img && onChange({ ...img, alt: e.target.value })}
            />
          </Field>
        </div>
      );
    }
    case "media": {
      const m = value as { kind?: string; src?: string } | undefined;
      return (
        <MediaField
          label={text}
          accept="any"
          value={m?.src}
          onChange={(src) =>
            onChange(src ? { kind: m?.kind ?? meta.kinds[0] ?? "audio", src } : undefined)
          }
        />
      );
    }
    case "link":
      return (
        <Field
          label={text}
          hint={meta.help ?? "A web address, an email, or a page path like /about"}
        >
          <LinkInput
            value={value}
            allow={meta.allow}
            onChange={(link) => onChange(link ?? (meta.optional ? undefined : value))}
          />
        </Field>
      );
    case "select":
      return (
        <Field label={text} hint={meta.help}>
          <Select
            value={value as string | undefined}
            onValueChange={(v) => onChange(v)}
            options={meta.options}
          />
        </Field>
      );
    case "boolean":
      return (
        <SwitchRow
          label={text}
          hint={meta.help}
          checked={Boolean(value)}
          onCheckedChange={(v) => onChange(v)}
        />
      );
    case "number":
      return (
        <Field label={text} hint={meta.help}>
          <Input
            type="number"
            min={meta.min}
            max={meta.max}
            step={meta.step ?? (meta.integer ? 1 : "any")}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) =>
              onChange(
                e.target.value === "" ? (meta.optional ? undefined : 0) : Number(e.target.value),
              )
            }
          />
        </Field>
      );
    case "list": {
      const items = Array.isArray(value) ? (value as Fields[]) : [];
      const set = (next: Fields[]) => onChange(next);
      const blank = () =>
        Object.fromEntries(
          Object.entries(meta.fields)
            .filter(([, m]) => !m.optional && m.default !== undefined)
            .map(([k, m]) => [k, structuredClone(m.default)]),
        );
      return (
        <fieldset className="st-fieldset st-listfield">
          <legend>{text}</legend>
          {items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no ids
            <div key={i} className="st-listfield__item">
              <div className="st-listfield__head">
                <span>
                  {label(name, meta).replace(/s$/, "")} {i + 1}
                </span>
                <span className="st-ws-actions">
                  <IconButton
                    size="sm"
                    label="Move up"
                    icon={<ArrowUp />}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...items];
                      [next[i - 1], next[i]] = [next[i] as Fields, next[i - 1] as Fields];
                      set(next);
                    }}
                  />
                  <IconButton
                    size="sm"
                    label="Move down"
                    icon={<ArrowDown />}
                    disabled={i === items.length - 1}
                    onClick={() => {
                      const next = [...items];
                      [next[i + 1], next[i]] = [next[i] as Fields, next[i + 1] as Fields];
                      set(next);
                    }}
                  />
                  <IconButton
                    size="sm"
                    label="Remove"
                    icon={<Trash2 />}
                    disabled={meta.min !== undefined && items.length <= meta.min}
                    onClick={() => set(items.filter((_, j) => j !== i))}
                  />
                </span>
              </div>
              <FieldsForm
                fields={meta.fields}
                values={item}
                onChange={(v) => set(items.map((x, j) => (j === i ? v : x)))}
              />
            </div>
          ))}
          <Button
            size="sm"
            icon={<Plus />}
            disabled={meta.max !== undefined && items.length >= meta.max}
            onClick={() => set([...items, blank()])}
          >
            Add
          </Button>
        </fieldset>
      );
    }
    default:
      return null;
  }
}

/** Link text box: shows what was typed, stores the parsed link. */
function LinkInput({
  value,
  allow,
  onChange,
  ...rest
}: {
  value: unknown;
  allow: string[];
  onChange: (link: Link | undefined) => void;
  id?: string;
}) {
  const [text, setText] = useState(() => linkToText(value));
  const last = useRef(linkToText(value));
  useEffect(() => {
    const t = linkToText(value);
    if (t !== last.current) {
      last.current = t;
      setText(t);
    }
  }, [value]);
  return (
    <Input
      {...rest}
      value={text}
      placeholder="https://…"
      onChange={(e) => {
        setText(e.target.value);
        const link = textToLink(e.target.value, allow);
        last.current = link ? linkToText(link) : "";
        onChange(link);
      }}
    />
  );
}

export function FieldsForm({
  fields,
  values,
  onChange,
}: {
  fields: Record<string, FieldMeta>;
  values: Fields;
  onChange: (next: Fields) => void;
}) {
  return (
    <div className="st-form">
      {Object.entries(fields)
        .filter(([, m]) => !SKIP.has(m.kind))
        .map(([k, m]) => (
          <FieldControl
            key={k}
            name={k}
            meta={m}
            value={values[k]}
            onChange={(v) => {
              const next = { ...values };
              if (v === undefined) delete next[k];
              else next[k] = v;
              onChange(next);
            }}
          />
        ))}
    </div>
  );
}
