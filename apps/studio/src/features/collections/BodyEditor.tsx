import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import type { Block, ImageValue, RichTextDoc } from "@omniharmonic/openspace-schema";
import { plainText } from "@omniharmonic/openspace-schema";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button, cx, IconButton, Menu, Select } from "../../ui";
import { useMediaPreviewUrl } from "../media/sources";
import { FieldsForm } from "./BlockFieldsForm";
import { freshBlock } from "./markdoc";
import { ProseEditor } from "./ProseEditor";
import "./collections.css";

/** Blocks a post body offers (prose first). */
export const BODY_BLOCKS = [
  "text",
  "image",
  "gallery",
  "video",
  "audio",
  "quote",
  "button",
  "accordion",
  "card",
  "line",
  "spacer",
] as const;

const registry = () => blocksRegistry();

export function blockLabel(type: string): string {
  if (type === "text") return "Text";
  return registry().get(type)?.meta.label ?? type;
}

function summary(block: Block): string {
  const f = block.fields as Record<string, unknown>;
  const first = (v: unknown) => (typeof v === "string" ? v : "");
  switch (block.type) {
    case "image":
      return (f.image as ImageValue | undefined)?.alt || "No description yet";
    case "gallery":
      return `${(f.images as unknown[] | undefined)?.length ?? 0} photos`;
    case "button":
      return first(f.label);
    case "quote":
      return f.quote ? plainText(f.quote as RichTextDoc).slice(0, 120) : "";
    case "heading":
      return first(f.text);
    case "video":
      return first(f.title) || first(f.url);
    case "audio":
      return first(f.title);
    case "accordion":
      return `${(f.items as unknown[] | undefined)?.length ?? 0} questions`;
    default:
      return first(f.heading) || first(f.title) || first(f.label);
  }
}

function Thumb({ block }: { block: Block }) {
  const img =
    block.type === "image"
      ? (block.fields.image as ImageValue | undefined)
      : block.type === "gallery"
        ? ((block.fields.images as Array<{ image?: ImageValue }> | undefined)?.[0]?.image ??
          undefined)
        : undefined;
  const url = useMediaPreviewUrl(img?.src);
  if (!url) return null;
  return <img className="st-body-block__thumb" src={url} alt="" />;
}

function InsertMenu({
  types,
  onPick,
  trigger,
}: {
  types: readonly string[];
  onPick: (type: string) => void;
  trigger: ReactNode;
}) {
  return (
    <Menu
      label="Add a block"
      trigger={trigger as React.ReactElement}
      items={types.map((t) => ({ label: blockLabel(t), onSelect: () => onPick(t) }))}
    />
  );
}

/**
 * A post or email body as a list of blocks: prose is typed straight into rich text; every other
 * block (photo, gallery, button, quote…) is a card with its own small form. Order with the
 * arrows; add between blocks with "+".
 */
export function BodyEditor({
  blocks,
  onChange,
  types = BODY_BLOCKS,
  label = "Body",
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  types?: readonly string[];
  label?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const insert = (at: number, type: string) => {
    const b = freshBlock(type);
    const next = [...blocks];
    next.splice(at, 0, b);
    onChange(next);
    if (type !== "text") setOpen(b.id);
  };
  const update = (id: string, patch: Partial<Block>) =>
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as Block, next[i] as Block];
    onChange(next);
  };
  const remove = (id: string) => onChange(blocks.filter((b) => b.id !== id));

  if (!blocks.length)
    return (
      <div className="st-body st-body--empty">
        <p>Start with some words, then add photos, buttons or quotes as you go.</p>
        <div className="st-ws-actions">
          <Button variant="primary" icon={<Plus />} onClick={() => insert(0, "text")}>
            Start writing
          </Button>
          <InsertMenu
            types={types.filter((t) => t !== "text")}
            onPick={(t) => insert(0, t)}
            trigger={<Button icon={<Plus />}>Add a block</Button>}
          />
        </div>
      </div>
    );

  return (
    <ol className="st-body" aria-label={label}>
      {blocks.map((block, i) => {
        const def = registry().get(block.type);
        const expanded = open === block.id;
        const variants = def?.meta.variants ?? [];
        const actions = (
          <span className="st-body-block__actions">
            <IconButton
              size="sm"
              label="Move up"
              icon={<ArrowUp />}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            />
            <IconButton
              size="sm"
              label="Move down"
              icon={<ArrowDown />}
              disabled={i === blocks.length - 1}
              onClick={() => move(i, 1)}
            />
            <Menu
              label={`${blockLabel(block.type)} options`}
              align="end"
              trigger={
                <IconButton
                  size="sm"
                  label={`${blockLabel(block.type)} options`}
                  icon={<MoreHorizontal />}
                />
              }
              items={[
                ...types.map((t) => ({
                  label: `Add ${blockLabel(t).toLowerCase()} below`,
                  onSelect: () => insert(i + 1, t),
                })),
                { type: "separator" as const },
                {
                  label: "Remove",
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: () => remove(block.id),
                },
              ]}
            />
          </span>
        );
        if (block.type === "text" && (!block.variant || block.variant === "default"))
          return (
            <li key={block.id} className="st-body-block st-body-block--text">
              <div className="st-body-block__bar">
                <span className="st-body-block__type">Text</span>
                {actions}
              </div>
              <ProseEditor
                label={`${label} text ${i + 1}`}
                value={block.fields.content as RichTextDoc}
                onChange={(content) => update(block.id, { fields: { ...block.fields, content } })}
                placeholder="Write something…"
              />
              <BetweenInsert types={types} onPick={(t) => insert(i + 1, t)} />
            </li>
          );
        return (
          <li key={block.id} className={cx("st-body-block", expanded && "is-open")}>
            <div className="st-body-block__bar">
              <button
                type="button"
                className="st-body-block__toggle"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : block.id)}
              >
                {expanded ? (
                  <ChevronDown aria-hidden="true" />
                ) : (
                  <ChevronRight aria-hidden="true" />
                )}
                <Thumb block={block} />
                <span className="st-body-block__type">{blockLabel(block.type)}</span>
                <span className="st-body-block__summary">{summary(block)}</span>
              </button>
              {actions}
            </div>
            {expanded && (
              <div className="st-body-block__form">
                {variants.length > 1 && (
                  <div className="st-body-block__variant">
                    <span>Style</span>
                    <Select
                      aria-label={`${blockLabel(block.type)} style`}
                      size="sm"
                      value={block.variant ?? variants[0]}
                      onValueChange={(v) => update(block.id, { variant: v })}
                      options={variants.map((v) => ({ value: v, label: v.replace(/-/g, " ") }))}
                    />
                  </div>
                )}
                {def && (
                  <FieldsForm
                    fields={def.meta.fields}
                    values={block.fields as Record<string, unknown>}
                    onChange={(fields) => update(block.id, { fields })}
                  />
                )}
              </div>
            )}
            <BetweenInsert types={types} onPick={(t) => insert(i + 1, t)} />
          </li>
        );
      })}
      <li className="st-body__end">
        <InsertMenu
          types={types}
          onPick={(t) => insert(blocks.length, t)}
          trigger={
            <Button size="sm" variant="ghost" icon={<Plus />}>
              Add a block
            </Button>
          }
        />
      </li>
    </ol>
  );
}

function BetweenInsert({
  types,
  onPick,
}: {
  types: readonly string[];
  onPick: (t: string) => void;
}) {
  return (
    <div className="st-body-insert">
      <InsertMenu
        types={types}
        onPick={onPick}
        trigger={
          <button type="button" className="st-body-insert__btn" aria-label="Add a block here">
            <Plus aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}
