import { allBlocks } from "@openspace/blocks";
import { type AnyBlockDefinition, BLOCK_CATEGORIES, type BlockCategory } from "@openspace/schema";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog as RDialog } from "radix-ui";
import { useMemo } from "react";
import { Kbd, toast } from "../../ui";
import { BlockIcon } from "../editor/blockIcons";
import { useDocStoreApi } from "../editor/model/context";
import { locate, sectionLabel } from "../editor/model/selection";
import { type BlockTarget, useBlockMenu } from "./blockMenuStore";
import { insertBlockCommand, targetFromSelection } from "./insert";
import "./add-section.css";

export const CATEGORY_LABEL: Record<BlockCategory, string> = {
  text: "Text",
  media: "Images & media",
  layout: "Layout",
  navigation: "Buttons & links",
  "social-proof": "Quotes & proof",
  forms: "Forms",
  commerce: "Selling",
  collections: "Blog, events & products",
  contact: "Contact & business",
  embed: "Embed & code",
  data: "Numbers & data",
};

export function blocksByCategory(): Array<[BlockCategory, AnyBlockDefinition[]]> {
  return BLOCK_CATEGORIES.map(
    (c) => [c, allBlocks.filter((b) => b.category === c)] as [BlockCategory, AnyBlockDefinition[]],
  ).filter(([, list]) => list.length > 0);
}

/**
 * The block menu (⌘/ or "/" on the canvas): searchable, grouped by category, keyboard
 * navigable. Inserts after the selected block (same column), or at the end of the selected
 * section, with fresh block and form ids; grid sections get a default placement.
 */
export function BlockMenu() {
  const api = useDocStoreApi();
  const open = useBlockMenu((s) => s.open);
  const explicit = useBlockMenu((s) => s.target);
  const groups = useMemo(blocksByCategory, []);
  const s = api.getState();
  const target: BlockTarget | null = open
    ? (explicit ?? targetFromSelection(s.doc, s.pageId, s.selection))
    : null;
  const loc = target ? locate(s.doc, s.pageId, { kind: "section", id: target.section }) : undefined;
  const where = loc
    ? `${sectionLabel(s.doc, loc.section, loc.sectionIndex)}${
        loc.section.layout.mode === "stack" && loc.section.layout.columns.d.length > 1
          ? ` · column ${(target?.column ?? 0) + 1}`
          : loc.section.layout.mode === "grid"
            ? " · grid"
            : ""
      }`
    : "";

  const insert = (type: string) => {
    useBlockMenu.getState().close();
    const st = api.getState();
    if (!target) {
      toast({ title: "Add a section first", description: "Blocks go inside sections." });
      return;
    }
    const cmd = insertBlockCommand(st.doc, st.pageId, type, target);
    const r = st.run(cmd);
    if (!r.ok) toast({ tone: "danger", title: "That block couldn’t be added here" });
  };

  return (
    <RDialog.Root open={open} onOpenChange={(o) => !o && useBlockMenu.getState().close()}>
      <RDialog.Portal>
        <RDialog.Overlay className="st-palette__overlay" />
        <RDialog.Content className="st-palette st-pop st-blockmenu" aria-describedby={undefined}>
          <RDialog.Title className="st-visually-hidden">Add a block</RDialog.Title>
          <Command label="Blocks" loop>
            <div className="st-palette__search">
              <Search aria-hidden="true" />
              <Command.Input className="st-palette__input" placeholder="Add a block…" autoFocus />
              <Kbd shortcut="esc" tone="key" />
            </div>
            {where && <p className="st-blockmenu__where">Adding to {where}</p>}
            <Command.List className="st-palette__list st-blockmenu__list">
              <Command.Empty className="st-palette__empty">No matching blocks.</Command.Empty>
              {groups.map(([cat, defs]) => (
                <Command.Group
                  key={cat}
                  heading={CATEGORY_LABEL[cat]}
                  className="st-palette__group"
                >
                  {defs.map((d) => (
                    <Command.Item
                      key={d.type}
                      value={`${d.label} ${d.type}`}
                      keywords={[CATEGORY_LABEL[cat], d.description ?? "", d.ai.purpose]}
                      onSelect={() => insert(d.type)}
                      className="st-menu__item st-palette__item st-blockmenu__item"
                    >
                      <BlockIcon type={d.type} />
                      <span className="st-blockmenu__text">
                        <span className="st-menu__label">{d.label}</span>
                        {d.description && (
                          <span className="st-blockmenu__desc">{d.description}</span>
                        )}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
