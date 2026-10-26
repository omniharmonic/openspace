import {
  DEFAULT_FILE_KINDS,
  DEFAULT_FILE_MAX_MB,
  FORM_FILE_KIND_IDS,
  FORM_FILE_KINDS,
  type Form,
  type FormField,
  type FormFieldMeta,
  type FormFieldType,
  type Link,
} from "@openspace/schema";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button, Input, Menu, Segmented, Select, Toggle } from "../../../ui";
import { moveItem } from "../model/defaults";
import {
  BUILDER_TYPES,
  changeFieldType,
  FORM_TYPE_LABEL,
  formIssues,
  newFormField,
  snakeName,
  typesWithOptions,
  uniqueName,
} from "../model/form";
import { PanelSection, PropRow } from "../ui";
import { LinkControl } from "./link";
import { SortableList } from "./SortableList";
import type { ControlProps } from "./types";

const LINK_META = {
  kind: "link",
  allow: ["page", "item", "url"],
  optional: false,
  label: "Go to",
} as const;

/** Text input that commits on blur/Enter (form settings change as a whole form). */
function BlurInput({
  id,
  label,
  value,
  onCommit,
  placeholder,
  disabled,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? draft : value;
  return (
    <Input
      id={id}
      size="sm"
      aria-label={label}
      value={shown}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={invalid ? true : undefined}
      onFocus={() => {
        setDraft(value);
        setFocused(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/**
 * Form builder (FR-30): the eight allowed field types, required/optional, help, width,
 * options, then what happens after sending (a message or a redirect). There is no way to add
 * a password or card field, and labels asking for one are refused.
 */
export function FormBuilder({ id, value, onChange, disabled }: ControlProps<FormFieldMeta, Form>) {
  const [issues, setIssues] = useState<ReturnType<typeof formIssues>>([]);
  const [open, setOpen] = useState<number | null>(null);
  if (!value) return null;
  const form = value;
  const save = (next: Form, what = "Edit form") => {
    const found = formIssues(next);
    setIssues(found);
    if (found.length) return found[0]?.message ?? null;
    const err = onChange(next, { label: what });
    if (err) setIssues([{ message: err }]);
    return err;
  };
  const setField = (i: number, next: FormField) =>
    save({ ...form, fields: form.fields.map((f, j) => (j === i ? next : f)) }, "Edit form field");
  const issueFor = (i: number, key?: string) =>
    issues.find((x) => x.field === i && (key === undefined || x.key === key))?.message;

  const fieldBody = (f: FormField, i: number) => {
    const fid = `${id}-f${i}`;
    const others = form.fields.filter((_, j) => j !== i).map((x) => x.name);
    return (
      <>
        <PropRow label="Label" htmlFor={`${fid}-label`} error={issueFor(i, "label")}>
          <BlurInput
            id={`${fid}-label`}
            label="Field label"
            value={f.label}
            disabled={disabled}
            invalid={Boolean(issueFor(i, "label"))}
            onCommit={(l) => {
              const auto = f.name === uniqueName(snakeName(f.label), others);
              setField(i, {
                ...f,
                label: l,
                ...(auto ? { name: uniqueName(snakeName(l), others) } : {}),
              });
            }}
          />
        </PropRow>
        <PropRow label="Type">
          <Select<FormFieldType>
            aria-label="Field type"
            size="sm"
            value={f.type}
            disabled={disabled}
            onValueChange={(t) => setField(i, changeFieldType(f, t))}
            options={BUILDER_TYPES.map((t) => ({ value: t, label: FORM_TYPE_LABEL[t] }))}
          />
        </PropRow>
        <PropRow label="Required" htmlFor={`${fid}-req`}>
          <div className="st-ip-fixed">
            <Toggle
              id={`${fid}-req`}
              size="sm"
              checked={f.required === true}
              disabled={disabled}
              onCheckedChange={(c) => {
                const next = { ...f };
                if (c) next.required = true;
                else delete next.required;
                setField(i, next);
              }}
            />
          </div>
        </PropRow>
        <PropRow label="Width">
          <Segmented<"full" | "half">
            disabled={disabled}
            aria-label="Field width"
            size="sm"
            block
            value={f.width ?? "full"}
            onValueChange={(w) => {
              const next = { ...f };
              if (w === "half") next.width = "half";
              else delete next.width;
              setField(i, next);
            }}
            options={[
              { value: "full", label: "Full" },
              { value: "half", label: "Half" },
            ]}
          />
        </PropRow>
        {(f.type === "text" ||
          f.type === "email" ||
          f.type === "phone" ||
          f.type === "textarea") && (
          <PropRow label="Placeholder" htmlFor={`${fid}-ph`}>
            <BlurInput
              id={`${fid}-ph`}
              label="Placeholder"
              value={f.placeholder ?? ""}
              disabled={disabled}
              onCommit={(p) => {
                const next = { ...f };
                if (p.trim()) next.placeholder = p.trim();
                else delete next.placeholder;
                setField(i, next);
              }}
            />
          </PropRow>
        )}
        {typesWithOptions(f.type) && (
          <PropRow
            label="Options"
            stacked
            hint={
              f.type === "checkbox"
                ? "Leave empty for a single yes/no checkbox. One per line."
                : "One per line."
            }
            error={issueFor(i, "options")}
          >
            <textarea
              className="st-ip-textarea"
              aria-label="Options, one per line"
              key={"options" in f && f.options ? f.options.join("\n") : ""}
              defaultValue={"options" in f && f.options ? f.options.join("\n") : ""}
              disabled={disabled}
              onBlur={(e) => {
                const opts = e.target.value
                  .split("\n")
                  .map((o) => o.trim())
                  .filter(Boolean);
                const next = { ...f } as FormField & { options?: string[] };
                if (opts.length) next.options = [...new Set(opts)];
                else if (f.type === "checkbox") delete next.options;
                else {
                  setIssues([{ field: i, key: "options", message: "Add at least one option." }]);
                  return;
                }
                setField(i, next);
              }}
            />
          </PropRow>
        )}
        {f.type === "file" && (
          <FileLimits field={f} disabled={disabled === true} onChange={(n) => setField(i, n)} />
        )}
        {f.type === "select" && (
          <PropRow label="Many answers" htmlFor={`${fid}-multi`}>
            <div className="st-ip-fixed">
              <Toggle
                id={`${fid}-multi`}
                size="sm"
                checked={f.multiple === true}
                disabled={disabled}
                onCheckedChange={(c) => {
                  const next = { ...f };
                  if (c) next.multiple = true;
                  else delete next.multiple;
                  setField(i, next);
                }}
              />
            </div>
          </PropRow>
        )}
        <PropRow label="Help text" htmlFor={`${fid}-help`}>
          <BlurInput
            id={`${fid}-help`}
            label="Help text"
            value={f.help ?? ""}
            disabled={disabled}
            onCommit={(h) => {
              const next = { ...f };
              if (h.trim()) next.help = h.trim();
              else delete next.help;
              setField(i, next);
            }}
          />
        </PropRow>
        <PropRow
          label="Key"
          htmlFor={`${fid}-name`}
          hint="Column name in your form inbox and exports."
          error={issueFor(i, "name")}
        >
          <BlurInput
            id={`${fid}-name`}
            label="Submission key"
            value={f.name}
            disabled={disabled}
            onCommit={(n) => setField(i, { ...f, name: uniqueName(snakeName(n), others) })}
          />
        </PropRow>
      </>
    );
  };

  const success = form.success;
  return (
    <>
      <PanelSection title="Form fields" count={form.fields.length}>
        <SortableList
          label="Form fields"
          noun="field"
          disabled={disabled}
          openIndex={open}
          onOpenIndex={setOpen}
          rows={form.fields.map((f, i) => ({
            title: f.label,
            badge: (
              <span className="st-ip-form-type">
                {FORM_TYPE_LABEL[f.type]}
                {f.required && (
                  <span className="st-ip-req" title="Required">
                    *
                  </span>
                )}
              </span>
            ),
            body: () => fieldBody(f, i),
          }))}
          onMove={(from, to) =>
            save({ ...form, fields: moveItem(form.fields, from, to) }, "Reorder form fields")
          }
          onRemove={
            form.fields.length > 1
              ? (i) =>
                  save(
                    { ...form, fields: form.fields.filter((_, j) => j !== i) },
                    "Remove form field",
                  )
              : undefined
          }
          onDuplicate={(i) => {
            const src = form.fields[i] as FormField;
            const copy = {
              ...src,
              name: uniqueName(
                src.name,
                form.fields.map((x) => x.name),
              ),
            };
            const fields = [...form.fields];
            fields.splice(i + 1, 0, copy);
            save({ ...form, fields }, "Duplicate form field");
          }}
        />
        {issues.some((x) => x.field === undefined) && (
          <p className="st-ip-row__error" role="alert">
            {issues.find((x) => x.field === undefined)?.message}
          </p>
        )}
        <Menu
          label="Add a field"
          trigger={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus />}
              className="st-ip-add"
              disabled={disabled || form.fields.length >= 50}
            >
              Add field
            </Button>
          }
          items={BUILDER_TYPES.map((t) => ({
            label: FORM_TYPE_LABEL[t],
            onSelect: () => {
              const f = newFormField(t, form);
              if (!save({ ...form, fields: [...form.fields, f] }, "Add form field"))
                setOpen(form.fields.length);
            },
          }))}
        />
      </PanelSection>
      <PanelSection title="After sending">
        <PropRow label="Button" htmlFor={`${id}-submit`}>
          <BlurInput
            id={`${id}-submit`}
            label="Button label"
            value={form.submitLabel}
            disabled={disabled}
            onCommit={(s) => s.trim() && save({ ...form, submitLabel: s.trim().slice(0, 40) })}
          />
        </PropRow>
        <PropRow label="Then">
          <Segmented<"message" | "redirect">
            disabled={disabled}
            aria-label="After sending"
            size="sm"
            block
            value={success.type}
            onValueChange={(t) =>
              save(
                {
                  ...form,
                  success:
                    t === "message"
                      ? { type: "message", message: "Thanks — we’ll be in touch soon." }
                      : { type: "redirect", link: { type: "url", url: "/" } },
                },
                "Change what happens after sending",
              )
            }
            options={[
              { value: "message", label: "Message" },
              { value: "redirect", label: "Redirect" },
            ]}
          />
        </PropRow>
        {success.type === "message" ? (
          <PropRow label="Message" stacked>
            <textarea
              className="st-ip-textarea"
              aria-label="Success message"
              defaultValue={success.message}
              key={success.message}
              disabled={disabled}
              onBlur={(e) => {
                const m = e.target.value.trim();
                if (m && m !== success.message)
                  save({ ...form, success: { type: "message", message: m.slice(0, 500) } });
              }}
            />
          </PropRow>
        ) : (
          <PropRow label="Go to" stacked>
            <LinkControl
              id={`${id}-redirect`}
              meta={LINK_META as never}
              label="Redirect"
              disabled={disabled}
              value={success.link}
              onChange={(l) => save({ ...form, success: { type: "redirect", link: l as Link } })}
            />
          </PropRow>
        )}
        <PropRow label="Email me" htmlFor={`${id}-notify`} hint="Get an email for every new entry.">
          <div className="st-ip-fixed">
            <Toggle
              id={`${id}-notify`}
              size="sm"
              checked={form.notifyOwner === true}
              disabled={disabled}
              onCheckedChange={(c) => {
                const next = { ...form };
                if (c) next.notifyOwner = true;
                else delete next.notifyOwner;
                save(next);
              }}
            />
          </div>
        </PropRow>
        <PropRow
          label="Form name"
          htmlFor={`${id}-name`}
          hint="How entries are grouped in your inbox."
        >
          <BlurInput
            id={`${id}-name`}
            label="Form name"
            value={form.name}
            disabled={disabled}
            onCommit={(n) => n.trim() && save({ ...form, name: n.trim().slice(0, 80) })}
          />
        </PropRow>
      </PanelSection>
    </>
  );
}

/**
 * File upload limits: which kinds of file and how large. Files are kept privately by OpenSpace
 * (never in the site's files) and shown in the form inbox.
 */
function FileLimits({
  field,
  disabled,
  onChange,
}: {
  field: Extract<FormField, { type: "file" }>;
  disabled: boolean;
  onChange: (next: FormField) => void;
}) {
  const kinds = field.accept ?? [...DEFAULT_FILE_KINDS];
  const max = field.maxSizeMb ?? DEFAULT_FILE_MAX_MB;
  return (
    <>
      <PropRow
        label="Accepts"
        stacked
        hint="Files are kept privately for you, never published with your site."
      >
        <fieldset className="st-ip-chips" aria-label="Accepted files">
          {FORM_FILE_KIND_IDS.map((k) => {
            const on = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                className="st-ip-chip"
                aria-pressed={on}
                disabled={disabled || (on && kinds.length === 1)}
                onClick={() => {
                  const next = on ? kinds.filter((x) => x !== k) : [...kinds, k];
                  const sorted = FORM_FILE_KIND_IDS.filter((x) => next.includes(x));
                  const isDefault =
                    sorted.length === DEFAULT_FILE_KINDS.length &&
                    sorted.every((x) => DEFAULT_FILE_KINDS.includes(x));
                  const { accept: _a, ...rest } = field;
                  onChange((isDefault ? rest : { ...rest, accept: sorted }) as FormField);
                }}
              >
                {FORM_FILE_KINDS[k].label}
              </button>
            );
          })}
        </fieldset>
      </PropRow>
      <PropRow label="Largest file">
        <Select<string>
          aria-label="Largest file"
          size="sm"
          value={String(max)}
          disabled={disabled}
          onValueChange={(v) => {
            const { maxSizeMb: _m, ...rest } = field;
            const n = Number(v);
            onChange((n === DEFAULT_FILE_MAX_MB ? rest : { ...rest, maxSizeMb: n }) as FormField);
          }}
          options={[1, 2, 5, 10, 25].map((n) => ({ value: String(n), label: `${n} MB` }))}
        />
      </PropRow>
    </>
  );
}
