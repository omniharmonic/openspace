import { z } from "zod";
import { FormIdSchema } from "./ids";
import { LinkSchema } from "./primitives";
import { named } from "./registry";

/** Allowed form field types (PRD FR-30). */
export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "date",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

/**
 * Field types that are never allowed (Global Constraint 12): sites must not collect passwords or
 * card numbers through forms. Payment goes through Stripe Checkout; accounts through members.
 */
export const FORBIDDEN_FORM_FIELD_TYPES = [
  "password",
  "card",
  "card-number",
  "credit-card",
  "cc-number",
  "cvc",
  "cvv",
] as const;

/** Labels/names that ask for a password or card details, regardless of declared type. */
export const FORBIDDEN_FIELD_PATTERN =
  /pass(?:word|wd|phrase)|\bpin\b|card[\s_-]*(?:number|no\b|num)|credit[\s_-]*card|\bcc[\s_-]*(?:num|number|no\b)|\bcvv\b|\bcvc\b|security[\s_-]*code|expir(?:y|ation)[\s_-]*date/i;

const FieldBase = {
  /** Machine name used as the submission key. */
  name: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, { message: "Expected a snake_case field name" }),
  label: z.string().min(1).max(120),
  required: z.boolean().optional(),
  help: z.string().max(300).optional(),
  width: z.enum(["full", "half"]).optional(),
};

const Options = z.array(z.string().min(1).max(120)).min(1).max(100);

export const FormFieldSchema = named(
  "FormField",
  "A form field: text, email, phone, textarea, select, checkbox, radio or date. Never password or card fields.",
  z.discriminatedUnion(
    "type",
    [
      z.strictObject({
        ...FieldBase,
        type: z.literal("text"),
        placeholder: z.string().max(120).optional(),
        maxLength: z.int().min(1).max(1000).optional(),
      }),
      z.strictObject({
        ...FieldBase,
        type: z.literal("email"),
        placeholder: z.string().max(120).optional(),
      }),
      z.strictObject({
        ...FieldBase,
        type: z.literal("phone"),
        placeholder: z.string().max(120).optional(),
      }),
      z.strictObject({
        ...FieldBase,
        type: z.literal("textarea"),
        placeholder: z.string().max(200).optional(),
        maxLength: z.int().min(1).max(10_000).optional(),
      }),
      z.strictObject({
        ...FieldBase,
        type: z.literal("select"),
        options: Options,
        multiple: z.boolean().optional(),
      }),
      z.strictObject({
        ...FieldBase,
        type: z.literal("checkbox"),
        /** Absent: a single yes/no checkbox (e.g. consent). Present: a checkbox group. */
        options: Options.optional(),
      }),
      z.strictObject({ ...FieldBase, type: z.literal("radio"), options: Options }),
      z.strictObject({ ...FieldBase, type: z.literal("date") }),
    ],
    {
      error: (issue) => {
        const type = (issue.input as { type?: unknown } | undefined)?.type;
        if (
          typeof type === "string" &&
          (FORBIDDEN_FORM_FIELD_TYPES as readonly string[]).includes(type)
        ) {
          return `Field type "${type}" is not allowed: forms must never collect passwords or card details`;
        }
        if (issue.code === "invalid_union") {
          return `Unknown form field type; expected one of ${FORM_FIELD_TYPES.join(", ")}`;
        }
        return undefined;
      },
    },
  ),
);
export type FormField = z.infer<typeof FormFieldSchema>;

export const FormSchema = named(
  "Form",
  "A form definition: fields, submit label and what happens after a successful submission.",
  z
    .strictObject({
      id: FormIdSchema,
      name: z.string().min(1).max(80),
      fields: z.array(FormFieldSchema).min(1).max(50),
      submitLabel: z.string().min(1).max(40),
      success: z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("message"), message: z.string().min(1).max(500) }),
        z.strictObject({ type: z.literal("redirect"), link: LinkSchema }),
      ]),
      /** Email the site owner on each submission (the address lives in the Hub, not here). */
      notifyOwner: z.boolean().optional(),
    })
    .superRefine((form, ctx) => {
      const names = new Set<string>();
      form.fields.forEach((f, i) => {
        if (names.has(f.name)) {
          ctx.addIssue({
            code: "custom",
            path: ["fields", i, "name"],
            message: `Duplicate field name ${f.name}`,
          });
        }
        names.add(f.name);
        for (const key of ["name", "label"] as const) {
          if (FORBIDDEN_FIELD_PATTERN.test(f[key].replace(/_/g, " "))) {
            ctx.addIssue({
              code: "custom",
              path: ["fields", i, key],
              message: "Forms must never collect passwords or card details",
            });
          }
        }
      });
    }),
);
export type Form = z.infer<typeof FormSchema>;

/**
 * Where a no-JS submission of `form` goes on success: an absolute URL or a site path (without the
 * deploy base path), or null when the form shows a message instead. Shared by site-kit's published
 * `/_os/forms.json` and the Hub's dev manifest so both always agree.
 */
export function formRedirectHref(
  form: Form,
  pages: Readonly<Record<string, { slug: string } | undefined>>,
): string | null {
  if (form.success.type !== "redirect") return null;
  const l = form.success.link;
  switch (l.type) {
    case "url":
      return l.url;
    case "page": {
      const page = pages[l.page];
      if (!page) return null;
      return `${page.slug ? `/${page.slug}/` : "/"}${l.anchor ? `#${l.anchor}` : ""}`;
    }
    case "item":
      return `/${l.collection}/${l.slug}/`;
    default:
      return null;
  }
}
