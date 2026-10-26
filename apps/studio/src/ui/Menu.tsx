import { Check } from "lucide-react";
import { ContextMenu as RContext, DropdownMenu as RDropdown } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import { Kbd } from "./Kbd";
import "./surfaces.css";

export type MenuEntry =
  | {
      type?: "item";
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | {
      type: "checkbox";
      label: string;
      checked: boolean;
      onCheckedChange: (v: boolean) => void;
      shortcut?: string;
    }
  | { type: "separator" }
  | { type: "label"; label: string };

type Parts = typeof RDropdown | typeof RContext;

function renderEntries(P: Parts, entries: ReadonlyArray<MenuEntry>) {
  return entries.map((e, i) => {
    if (e.type === "separator") {
      // biome-ignore lint/suspicious/noArrayIndexKey: static positional list
      return <P.Separator key={`sep-${i}`} className="st-menu__sep" />;
    }
    if (e.type === "label") {
      return (
        <P.Label key={`label-${e.label}`} className="st-menu__group-label">
          {e.label}
        </P.Label>
      );
    }
    if (e.type === "checkbox") {
      return (
        <P.CheckboxItem
          key={e.label}
          checked={e.checked}
          onCheckedChange={(v) => e.onCheckedChange(v === true)}
          className="st-menu__item"
        >
          <span style={{ width: 14, display: "inline-flex" }}>
            <P.ItemIndicator>
              <Check />
            </P.ItemIndicator>
          </span>
          <span className="st-menu__label">{e.label}</span>
          {e.shortcut && <Kbd shortcut={e.shortcut} />}
        </P.CheckboxItem>
      );
    }
    return (
      <P.Item
        key={e.label}
        disabled={e.disabled}
        onSelect={e.onSelect}
        className={cx("st-menu__item", e.danger && "st-menu__item--danger")}
      >
        {e.icon}
        <span className="st-menu__label">{e.label}</span>
        {e.shortcut && <Kbd shortcut={e.shortcut} />}
      </P.Item>
    );
  });
}

export interface MenuProps {
  trigger: ReactElement;
  items: ReadonlyArray<MenuEntry>;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /** Accessible name for the menu surface. */
  label?: string;
}

/** Dropdown menu opened from a trigger button. */
export function Menu({ trigger, items, align = "start", side = "bottom", label }: MenuProps) {
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>{trigger}</RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content
          className="st-pop st-menu"
          align={align}
          side={side}
          sideOffset={4}
          collisionPadding={8}
          aria-label={label}
        >
          {renderEntries(RDropdown, items)}
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  );
}

export interface ContextMenuProps {
  children: ReactElement;
  items: ReadonlyArray<MenuEntry>;
  label?: string;
}

/** Right-click (or long-press) menu for its child area. */
export function ContextMenu({ children, items, label }: ContextMenuProps) {
  return (
    <RContext.Root>
      <RContext.Trigger asChild>{children}</RContext.Trigger>
      <RContext.Portal>
        <RContext.Content className="st-pop st-menu" collisionPadding={8} aria-label={label}>
          {renderEntries(RContext, items)}
        </RContext.Content>
      </RContext.Portal>
    </RContext.Root>
  );
}
