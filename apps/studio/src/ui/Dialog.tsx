import { X } from "lucide-react";
import { Dialog as RDialog } from "radix-ui";
import { type ReactElement, type ReactNode, useRef } from "react";
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
  const content = useRef<HTMLDivElement>(null);
  // Without a Radix trigger (dialogs opened from state), Radix has nowhere to send focus on
  // close; send it back to whatever opened the dialog (e.g. the Publish button).
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RDialog.Trigger asChild>{trigger}</RDialog.Trigger>}
      <RDialog.Portal>
        <RDialog.Overlay className="st-dialog__overlay" />
        <RDialog.Content
          ref={content}
          className={cx("st-dialog", className)}
          onOpenAutoFocus={(e) => {
            const active = document.activeElement;
            opener.current =
              active instanceof HTMLElement && active !== document.body ? active : null;
            // Prefer a field marked data-autofocus over the close button.
            const target = content.current?.querySelector<HTMLElement>("[data-autofocus]");
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            const back = opener.current;
            opener.current = null;
            if (trigger || !back?.isConnected) return;
            e.preventDefault();
            back.focus();
          }}
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
