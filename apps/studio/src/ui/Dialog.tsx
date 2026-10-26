import { X } from "lucide-react";
import { Dialog as RDialog } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import { cx } from "./cx";
import "./Dialog.css";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions, right-aligned. */
  footer?: ReactNode;
  width?: number;
  className?: string;
}

/** Radix wires Description automatically; opt out explicitly when there is none. */
const NO_DESCRIPTION = { "aria-describedby": undefined };

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  width = 440,
  className,
}: DialogProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RDialog.Trigger asChild>{trigger}</RDialog.Trigger>}
      <RDialog.Portal>
        <RDialog.Overlay className="st-dialog__overlay" />
        <RDialog.Content
          className={cx("st-dialog", className)}
          style={{ width: `min(${width}px, calc(100vw - 32px))` }}
          {...(description ? {} : NO_DESCRIPTION)}
        >
          <header className="st-dialog__head">
            <RDialog.Title className="st-dialog__title">{title}</RDialog.Title>
            <RDialog.Close asChild>
              <IconButton label="Close" icon={<X />} size="sm" tooltip={false} />
            </RDialog.Close>
          </header>
          {description && (
            <RDialog.Description className="st-dialog__desc">{description}</RDialog.Description>
          )}
          {children && <div className="st-dialog__body">{children}</div>}
          {footer && <footer className="st-dialog__foot">{footer}</footer>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export const DialogClose = RDialog.Close;
