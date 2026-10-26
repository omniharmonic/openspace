import { X } from "lucide-react";
import { Dialog as RDialog } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import "./Sheet.css";

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  children: ReactNode;
  /** "bottom" is the mobile bottom sheet; "right" a side drawer. */
  side?: "bottom" | "right";
  className?: string;
}

/** Bottom sheet for narrow screens (or a side drawer). */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  children,
  side = "bottom",
  className,
}: SheetProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RDialog.Trigger asChild>{trigger}</RDialog.Trigger>}
      <RDialog.Portal>
        <RDialog.Overlay className="st-sheet__overlay" />
        <RDialog.Content
          className={cx("st-sheet", `st-sheet--${side}`, className)}
          aria-describedby={undefined}
        >
          {side === "bottom" && <div className="st-sheet__grip" aria-hidden="true" />}
          <div className="st-sheet__head">
            <RDialog.Title className="st-sheet__title">{title}</RDialog.Title>
            <RDialog.Close asChild>
              <IconButton label="Close" icon={<X />} size="sm" tooltip={false} />
            </RDialog.Close>
          </div>
          <div className="st-sheet__body">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export const SheetClose = RDialog.Close;
