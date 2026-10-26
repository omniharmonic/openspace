import { Button, cx, resolveLink, useRenderContext } from "@openspace/renderer";
import { defineBlock, type Form, type FormField, f } from "@openspace/schema";
import { createContext, type ReactNode, useContext } from "react";
import { sub, useHub, useOwnerEmail } from "../shared";

/**
 * Spam-protection hook for form and newsletter blocks. The Hub (or site-kit) provides the
 * Turnstile site key when configured; blocks then emit a `[data-os-turnstile]` slot that the
 * Hub's Turnstile loader renders into (invisible by default, FR-31). Without a key, forms rely
 * on the honeypot plus the Hub's rate limits.
 */
export interface FormSecurity {
  turnstileSiteKey?: string;
}
export const FormSecurityContext = createContext<FormSecurity>({});

/** Hidden honeypot field (the Hub discards submissions that fill it). */
export function Honeypot() {
  return (
    <div className="os-hp" aria-hidden="true">
      <label>
        Leave this field empty
        <input type="text" name="_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

export function TurnstileSlot() {
  const { turnstileSiteKey } = useContext(FormSecurityContext);
  if (!turnstileSiteKey) return null;
  return (
    <div
      className="os-turnstile"
      data-os-turnstile={turnstileSiteKey}
      data-appearance="interaction-only"
    />
  );
}

/** The page the form lives on, so the Hub can redirect back after a no-JS submission. */
export function useSourcePath(): string {
  const ctx = useRenderContext();
  return ctx.page
    ? resolveLink({ type: "page", page: ctx.page.id }, { doc: ctx.doc, basePath: ctx.basePath })
        .href
    : "";
}

const DEFAULT_FORM: Form = {
  id: "frm_c0ntact0ne",
  name: "Contact",
  fields: [
    { type: "text", name: "name", label: "Name", required: true, width: "half" },
    { type: "email", name: "email", label: "Email", required: true, width: "half" },
    {
      type: "phone",
      name: "phone",
      label: "Phone",
      width: "half",
      help: "Optional — if you'd prefer a call back.",
    },
    {
      type: "select",
      name: "topic",
      label: "What can we help with?",
      width: "half",
      options: ["Private sessions", "Group classes", "Workshops & retreats", "Something else"],
    },
    {
      type: "textarea",
      name: "message",
      label: "Message",
      required: true,
      placeholder: "Tell us a little about what you're looking for.",
      maxLength: 2000,
    },
    { type: "checkbox", name: "updates", label: "Send me the monthly studio letter" },
  ],
  submitLabel: "Send message",
  success: {
    type: "message",
    message: "Thank you — your message is on its way. We reply within two working days.",
  },
  notifyOwner: true,
};

const AUTOCOMPLETE: Record<string, string> = {
  email: "email",
  phone: "tel",
  name: "name",
  full_name: "name",
  first_name: "given-name",
  last_name: "family-name",
  company: "organization",
  organization: "organization",
  address: "street-address",
  city: "address-level2",
  postcode: "postal-code",
  zip: "postal-code",
  country: "country-name",
  website: "url",
};

export const formBlock = defineBlock({
  type: "form",
  version: 1,
  category: "forms",
  label: "Form",
  icon: "clipboard-list",
  description:
    "A contact or enquiry form. Entries go to your Inbox; works even when JavaScript is off.",
  fields: {
    form: f.form({
      default: DEFAULT_FORM,
      ai: "Ask only for what the owner needs. Field types: text, email, phone, textarea, select, checkbox, radio, date. Never ask for passwords or card details.",
    }),
  },
  variants: ["default", "card", "underline"],
  styleSlots: ["colorTheme", "padding", "radius", "border", "shadow", "animation"],
  ai: {
    purpose: "Collects enquiries, bookings requests, RSVPs or applications into the owner's Inbox.",
    whenToUse:
      "Contact pages and anywhere visitors need to send structured details. Pair with a short text block explaining what happens next.",
    avoid:
      "Long forms (keep under ~8 fields); asking for sensitive data; password or payment fields (not allowed — payments go through checkout).",
  },
  render: ({ id, fields, variant }) => <FormView id={id} form={fields.form} variant={variant} />,
});

function FieldShell({
  field,
  id,
  children,
  as = "div",
}: {
  field: FormField;
  id: string;
  children: ReactNode;
  as?: "div" | "fieldset";
}) {
  const Tag = as;
  return (
    <Tag
      className={cx(
        "os-field",
        `os-field--${field.type}`,
        field.width === "half" && "os-field--half",
      )}
    >
      {children}
      {field.help ? (
        <p className="os-field__help" id={`${id}-help`}>
          {field.help}
        </p>
      ) : null}
      <p className="os-field__error" id={`${id}-error`} aria-live="polite" />
    </Tag>
  );
}

function Label({ field, htmlFor }: { field: FormField; htmlFor: string }) {
  return (
    <label className="os-label" htmlFor={htmlFor}>
      {field.label}
      {field.required ? (
        <span className="os-required" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldView({ field, base }: { field: FormField; base: string }) {
  const id = sub(base, field.name);
  const describedBy = [field.help && `${id}-help`, `${id}-error`].filter(Boolean).join(" ");
  const common = {
    id,
    name: field.name,
    required: field.required || undefined,
    "aria-describedby": describedBy,
  };
  switch (field.type) {
    case "text":
    case "email":
    case "phone":
    case "date": {
      const type = field.type === "phone" ? "tel" : field.type;
      return (
        <FieldShell field={field} id={id}>
          <Label field={field} htmlFor={id} />
          <input
            className="os-input"
            type={type}
            autoComplete={AUTOCOMPLETE[field.type === "text" ? field.name : field.type]}
            placeholder={"placeholder" in field ? field.placeholder : undefined}
            maxLength={field.type === "text" ? field.maxLength : undefined}
            inputMode={field.type === "phone" ? "tel" : undefined}
            {...common}
          />
        </FieldShell>
      );
    }
    case "textarea":
      return (
        <FieldShell field={field} id={id}>
          <Label field={field} htmlFor={id} />
          <textarea
            className="os-textarea"
            rows={5}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            {...common}
          />
        </FieldShell>
      );
    case "select":
      return (
        <FieldShell field={field} id={id}>
          <Label field={field} htmlFor={id} />
          <select
            className={cx("os-select", field.multiple && "is-multiple")}
            multiple={field.multiple || undefined}
            defaultValue={field.multiple ? undefined : ""}
            {...common}
            name={field.multiple ? `${field.name}[]` : field.name}
          >
            {field.multiple ? null : (
              <option value="" disabled={field.required || undefined}>
                Choose…
              </option>
            )}
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </FieldShell>
      );
    case "checkbox":
      if (!field.options)
        return (
          <FieldShell field={field} id={id}>
            <label className="os-check">
              <input type="checkbox" value="yes" {...common} />
              <span>
                {field.label}
                {field.required ? (
                  <span className="os-required" aria-hidden="true">
                    *
                  </span>
                ) : null}
              </span>
            </label>
          </FieldShell>
        );
      return (
        <Choices
          field={field}
          id={id}
          type="checkbox"
          options={field.options}
          describedBy={describedBy}
        />
      );
    case "radio":
      return (
        <Choices
          field={field}
          id={id}
          type="radio"
          options={field.options}
          describedBy={describedBy}
        />
      );
  }
}

function Choices({
  field,
  id,
  type,
  options,
  describedBy,
}: {
  field: FormField;
  id: string;
  type: "checkbox" | "radio";
  options: string[];
  describedBy: string;
}) {
  return (
    <FieldShell field={field} id={id} as="fieldset">
      <legend className="os-label">
        {field.label}
        {field.required ? (
          <span className="os-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </legend>
      <div className="os-choices">
        {options.map((o, i) => (
          <label className="os-check" key={o}>
            <input
              type={type}
              id={i === 0 ? id : undefined}
              name={type === "checkbox" ? `${field.name}[]` : field.name}
              value={o}
              required={(type === "radio" && field.required) || undefined}
              aria-describedby={describedBy}
            />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </FieldShell>
  );
}

function FormView({ id, form, variant }: { id: string; form: Form; variant: string }) {
  const ctx = useRenderContext();
  const { hub, siteId } = useHub();
  const owner = useOwnerEmail();
  const source = useSourcePath();
  const action = `${hub}/f/${siteId}/${form.id}`;
  const redirect =
    form.success.type === "redirect"
      ? resolveLink(form.success.link, {
          doc: ctx.doc,
          basePath: ctx.basePath,
          currentPageId: ctx.page?.id,
        }).href
      : undefined;
  const message = form.success.type === "message" ? form.success.message : undefined;
  const sentId = sub(id, "sent");
  return (
    <form
      className={cx("os-form", "os-formblock", `os-formblock--${variant}`)}
      method="post"
      action={action}
      acceptCharset="utf-8"
      data-os-behavior="form"
      data-os-form={form.id}
      data-os-success={message}
      data-os-redirect={redirect}
      data-os-owner-email={owner}
    >
      <div className="os-formblock__fields">
        {form.fields.map((field) => (
          <FieldView key={field.name} field={field} base={id} />
        ))}
      </div>
      <input type="hidden" name="_source" value={source} />
      {message ? <input type="hidden" name="_anchor" value={sentId} /> : null}
      <Honeypot />
      <TurnstileSlot />
      <div className="os-formblock__actions">
        <Button type="submit">{form.submitLabel}</Button>
        {form.fields.some((x) => x.required) ? (
          <p className="os-formblock__legend">
            <span className="os-required" aria-hidden="true">
              *
            </span>{" "}
            Required
          </p>
        ) : null}
      </div>
      <div className="os-form__status" role="status" aria-live="polite" />
      {message ? (
        <p className="os-formblock__sent" id={sentId} tabIndex={-1}>
          {message}
        </p>
      ) : null}
    </form>
  );
}

export const formCss = `
.os-formblock__fields{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--os-space-sm)}
@container block (min-width:32rem){.os-formblock__fields{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:var(--os-space-sm)}.os-formblock__fields>.os-field{grid-column:1/-1}.os-formblock__fields>.os-field--half{grid-column:auto}}
.os-formblock fieldset.os-field{margin:0;padding:0;border:0;min-inline-size:0}
.os-formblock legend.os-label{padding:0;margin-bottom:var(--os-space-2xs)}
.os-choices{display:flex;flex-wrap:wrap;gap:var(--os-space-2xs) var(--os-space-sm)}
.os-select.is-multiple{background-image:none;padding-inline-end:0.95em;min-height:8rem}
.os-formblock__actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--os-space-xs);margin-top:var(--os-space-2xs)}
.os-formblock__legend{font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}
.os-formblock__sent{display:none;padding:var(--os-space-xs) var(--os-space-sm);border:1.5px solid currentColor;border-radius:var(--os-radius-input);color:var(--os-color-success)}
.os-formblock__sent:target{display:block}
.os-formblock--card{padding:var(--os-space-md);background:var(--os-color-surface-raised);border-radius:var(--os-radius-card);box-shadow:var(--os-shadow-sm)}
.os-block.has-radius .os-formblock--card{border-radius:var(--radius)}
.os-block.os-themed .os-formblock--card{background:transparent;padding:0;box-shadow:none}
.os-formblock--underline .os-input,.os-formblock--underline .os-textarea,.os-formblock--underline .os-select{border-width:0 0 1px;border-radius:0;padding-inline:0;background-color:transparent}
.os-formblock--underline .os-select{padding-inline-end:2em}
.os-formblock--underline .os-textarea{min-height:6rem}
.os-formblock--underline .os-input:focus-visible,.os-formblock--underline .os-textarea:focus-visible,.os-formblock--underline .os-select:focus-visible{outline-offset:4px}
.os-formblock--underline .os-label{font-weight:var(--os-font-weight-body);color:var(--os-color-text-muted);text-transform:uppercase;letter-spacing:0.08em;font-size:0.75rem}
`;
