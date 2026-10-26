import {
  FORBIDDEN_FIELD_PATTERN,
  FORM_FIELD_TYPES,
  type Form,
  type FormField,
  type FormFieldType,
  FormSchema,
} from "@openspace/schema";

/**
 * Form builder model (FR-30). Only the allowed field types exist in the builder, so a
 * password or card-number field can't be created; labels and names that ask for one are
 * refused as well (Global Constraint 12).
 */

export const FORM_TYPE_LABEL: Record<FormFieldType, string> = {
  text: "Short text",
  email: "Email",
  phone: "Phone",
  textarea: "Long text",
  select: "Dropdown",
  checkbox: "Checkbox",
  radio: "Choice",
  date: "Date",
  file: "File upload",
};

export const BUILDER_TYPES: readonly FormFieldType[] = FORM_FIELD_TYPES;

export const typesWithOptions = (t: FormFieldType) =>
  t === "select" || t === "radio" || t === "checkbox";

/** A label → snake_case submission key (`Your name` → `your_name`). */
export function snakeName(label: string): string {
  const base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  const name = /^[a-z]/.test(base) ? base : `field_${base}`.replace(/_+$/, "");
  return name || "field";
}

/** A name not already used in the form (`email`, `email_2`, …). */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) {
    const next = `${name.slice(0, 36)}_${i}`;
    if (!used.has(next)) return next;
  }
}

/** True when a label or name asks for a password or card details. */
export function isForbiddenText(text: string): boolean {
  return FORBIDDEN_FIELD_PATTERN.test(text.replace(/_/g, " "));
}

const DEFAULT_LABEL: Record<FormFieldType, string> = {
  text: "Name",
  email: "Email",
  phone: "Phone",
  textarea: "Message",
  select: "Choose one",
  checkbox: "Keep me posted",
  radio: "Pick one",
  date: "Date",
  file: "Attach a file",
};

/** A new field of `type`, named uniquely within the form. */
export function newFormField(type: FormFieldType, form: Pick<Form, "fields">): FormField {
  if (!(BUILDER_TYPES as readonly string[]).includes(type))
    throw new Error(`Field type "${type}" is not allowed`);
  const label = DEFAULT_LABEL[type];
  const name = uniqueName(
    snakeName(label),
    form.fields.map((f) => f.name),
  );
  const base = { name, label };
  if (type === "select" || type === "radio")
    return { ...base, type, options: ["First option", "Second option"] } as FormField;
  return { ...base, type } as FormField;
}

/** Change a field's type, keeping what carries over (label, name, required, help, width). */
export function changeFieldType(field: FormField, type: FormFieldType): FormField {
  if (!(BUILDER_TYPES as readonly string[]).includes(type))
    throw new Error(`Field type "${type}" is not allowed`);
  const keep: Record<string, unknown> = { name: field.name, label: field.label, type };
  for (const k of ["required", "help", "width"] as const)
    if (field[k] !== undefined) keep[k] = field[k];
  const options = "options" in field && field.options ? field.options : undefined;
  if (type === "select" || type === "radio")
    keep.options = options ?? ["First option", "Second option"];
  if (type === "checkbox" && options) keep.options = options;
  if (
    (type === "text" || type === "email" || type === "phone" || type === "textarea") &&
    "placeholder" in field &&
    field.placeholder
  )
    keep.placeholder = field.placeholder;
  return keep as FormField;
}

export interface FormIssue {
  /** Index of the field the issue is about, if any. */
  field?: number;
  key?: string;
  message: string;
}

/** Plain-language problems with a form, or none when it can be saved. */
export function formIssues(form: Form): FormIssue[] {
  const out: FormIssue[] = [];
  form.fields.forEach((f, i) => {
    if (isForbiddenText(f.label) || isForbiddenText(f.name))
      out.push({
        field: i,
        key: "label",
        message: "Forms can’t ask for passwords or card details. Payments use secure checkout.",
      });
    if (!f.label.trim()) out.push({ field: i, key: "label", message: "Give this field a label." });
  });
  const names = new Map<string, number>();
  form.fields.forEach((f, i) => {
    if (names.has(f.name))
      out.push({ field: i, key: "name", message: `Another field already uses “${f.name}”.` });
    names.set(f.name, i);
  });
  if (!form.fields.length) out.push({ message: "A form needs at least one field." });
  if (out.length) return out;
  const parsed = FormSchema.safeParse(form);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [first, index, key] = issue.path;
      out.push({
        ...(first === "fields" && typeof index === "number" ? { field: index } : {}),
        ...(typeof key === "string" ? { key } : {}),
        message: issue.message,
      });
    }
  }
  return out;
}
