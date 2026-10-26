import { Popover as RPopover } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import "./surfaces.css";
import "./Popover.css";

export interface PopoverProps {
  trigger: ReactElement;
  children: ReactNode;
  /** Optional heading row, Figma-style. */
  title?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  width?: number;
}

export function Popover({
  trigger,
  children,
  title,
  side = "bottom",
  align = "start",
  open,
  onOpenChange,
  className,
  width = 240,
}: PopoverProps) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cx("st-pop st-popover", className)}
          style={{ width }}
          aria-label={typeof title === "string" ? title : undefined}
        >
          {title && <div className="st-popover__title">{title}</div>}
          <div className="st-popover__body">{children}</div>
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export const PopoverClose = RPopover.Close;
