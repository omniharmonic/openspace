import {
  type FieldMeta,
  type JsonValue,
  type ListFieldMeta,
  plainText,
  type RichTextDoc,
} from "@openspace/schema";
import { Plus } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "../../../ui";
import { itemTitle, moveItem, newListItem } from "../model/defaults";
import { PanelSection, PropRow } from "../ui";
import { BooleanControl, ColorControl, NumberControl, SelectControl, TextControl } from "./basic";
import { FormBuilder } from "./form";
import { LinkControl } from "./link";
import { ImageControl, MediaControl } from "./media";
import { EmbedControl, ReferenceControl } from "./reference";
import { RichTextControl } from "./richtext";
import { SortableList } from "./SortableList";
import { type ChangeOptions, type ControlProps, useFieldsContext } from "./types";

type Values = Record<string, unknown>;
export type OnField = (key: string, value: unknown, options?: ChangeOptions) => string | null;

const plain = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && (v as { type?: string }).type === "doc")
    return plainText(v as RichTextDoc);
  return "";
};

/** Controls that manage their own label (wide, multi-part editors). */
const WIDE = new Set<FieldMeta["kind"]>([
  "richText",
  "image",
  "media",
  "list",
  "form",
  "reference",
  "embed",
  "link",
]);

// biome-ignore lint/suspicious/noExplicitAny: each control narrows the field meta and value itself
const CONTROLS: Record<FieldMeta["kind"], ComponentType<any>> = {
  text: TextControl,
  richText: RichTextControl,
  image: ImageControl,
  media: MediaControl,
  link: LinkControl,
  select: SelectControl,
  boolean: BooleanControl,
  number: NumberControl,
  color: ColorControl,
  list: ListControl,
  reference: ReferenceControl,
  form: FormBuilder,
  embed: EmbedControl,
};

function Control(props: ControlProps & { defaults?: JsonValue }) {
  const C = CONTROLS[props.meta.kind];
  return <C {...props} />;
}

/** One field: a labelled row (or a stacked block for wide editors). */
export function FieldRow({
  name,
  meta,
  value,
  onField,
  idPrefix,
  defaults,
}: {
  name: string;
  meta: FieldMeta;
  value: unknown;
  onField: OnField;
  idPrefix: string;
  defaults?: JsonValue;
}) {
  const { caps } = useFieldsContext();
  const id = `${idPrefix}-${name}`;
  const label = meta.label ?? name;
  const disabled = !caps.field(meta.kind);
  const control = (
    <Control
      id={id}
      meta={meta}
      label={label}
      value={value}
      disabled={disabled}
      onChange={(v, o) => onField(name, v, o)}
      {...(defaults !== undefined ? { defaults } : {})}
    />
  );
  if (meta.kind === "form") return control;
  const labelled = meta.kind === "text" || meta.kind === "number" || meta.kind === "boolean";
  return (
    <PropRow
      label={label}
      {...(labelled ? { htmlFor: id } : {})}
      stacked={WIDE.has(meta.kind) || (meta.kind === "text" && meta.multiline === true)}
      hint={meta.help}
    >
      {control}
    </PropRow>
  );
}

/** A list field: reorderable items, each a nested set of fields (FR: list editors). */
export function ListControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
  defaults,
}: ControlProps<ListFieldMeta, Values[]> & { defaults?: JsonValue }) {
  const items = value ?? [];
  const max = meta.max ?? 100;
  const min = meta.min ?? 0;
  const noun = label.toLowerCase().replace(/s$/, "") || "item";
  const set = (next: Values[], what: string, merge = false) =>
    onChange(next, { label: what, merge });
  return (
    <div className="st-ip-listfield">
      <SortableList
        label={label}
        noun={noun}
        disabled={disabled}
        rows={items.map((item, i) => ({
          title: itemTitle(meta, item, i, plain),
          body: () => (
            <FieldsList
              fields={meta.fields}
              values={item}
              idPrefix={`${id}-${i}`}
              onField={(key, v, o) => {
                const next = items.map((it, j) => {
                  if (j !== i) return it;
                  const copy = { ...it };
                  if (v === undefined) delete copy[key];
                  else copy[key] = v;
                  return copy;
                });
                return set(next, o?.label ?? `Edit ${noun}`, o?.merge);
              }}
            />
          ),
        }))}
        onMove={(from, to) => set(moveItem(items, from, to), `Reorder ${label.toLowerCase()}`)}
        {...(items.length > min
          ? {
              onRemove: (i: number) =>
                set(
                  items.filter((_, j) => j !== i),
                  `Remove ${noun}`,
                ),
            }
          : {})}
        {...(items.length < max
          ? {
              onDuplicate: (i: number) => {
                const copy = newListItem(meta, [items[i] as Values]);
                set([...items.slice(0, i + 1), copy, ...items.slice(i + 1)], `Duplicate ${noun}`);
              },
            }
          : {})}
      />
      <Button
        size="sm"
        variant="secondary"
        icon={<Plus />}
        className="st-ip-add"
        disabled={disabled || items.length >= max}
        onClick={() => set([...items, newListItem(meta, items, defaults)], `Add ${noun}`)}
      >
        Add {noun}
      </Button>
    </div>
  );
}

/** Every field of a field map, in definition order. */
export function FieldsList({
  fields,
  values,
  onField,
  idPrefix,
  defaults,
}: {
  fields: Record<string, FieldMeta>;
  values: Values;
  onField: OnField;
  idPrefix: string;
  defaults?: Record<string, JsonValue>;
}) {
  return (
    <>
      {Object.entries(fields).map(([name, meta]) => (
        <FieldRow
          key={name}
          name={name}
          meta={meta}
          value={values[name]}
          onField={onField}
          idPrefix={idPrefix}
          {...(defaults?.[name] !== undefined ? { defaults: defaults[name] } : {})}
        />
      ))}
    </>
  );
}

/**
 * The block's fields grouped into panel sections: simple fields together under "Content",
 * then one section per list and form so long editors stay collapsible.
 */
export function GroupedFields({
  fields,
  values,
  onField,
  idPrefix,
  defaults,
  extra,
}: {
  fields: Record<string, FieldMeta>;
  values: Values;
  onField: OnField;
  idPrefix: string;
  defaults?: Record<string, JsonValue>;
  extra?: ReactNode;
}) {
  const { caps } = useFieldsContext();
  const simple: Record<string, FieldMeta> = {};
  const sections: Array<[string, FieldMeta]> = [];
  for (const [name, meta] of Object.entries(fields)) {
    if (meta.kind === "list" || meta.kind === "form" || meta.kind === "reference")
      sections.push([name, meta]);
    else simple[name] = meta;
  }
  return (
    <>
      {(Object.keys(simple).length > 0 || extra) && (
        <PanelSection title="Content">
          <FieldsList
            fields={simple}
            values={values}
            onField={onField}
            idPrefix={idPrefix}
            {...(defaults ? { defaults } : {})}
          />
          {extra}
        </PanelSection>
      )}
      {sections.map(([name, meta]) =>
        meta.kind === "form" ? (
          <FieldRow
            key={name}
            name={name}
            meta={meta}
            value={values[name]}
            onField={onField}
            idPrefix={idPrefix}
          />
        ) : (
          <PanelSection
            key={name}
            title={meta.label ?? name}
            {...(meta.kind === "list"
              ? { count: (values[name] as unknown[] | undefined)?.length ?? 0 }
              : {})}
          >
            <Control
              id={`${idPrefix}-${name}`}
              meta={meta}
              label={meta.label ?? name}
              value={values[name]}
              disabled={!caps.field(meta.kind)}
              onChange={(v, o) => onField(name, v, o)}
              {...(defaults?.[name] !== undefined ? { defaults: defaults[name] } : {})}
            />
          </PanelSection>
        ),
      )}
    </>
  );
}
