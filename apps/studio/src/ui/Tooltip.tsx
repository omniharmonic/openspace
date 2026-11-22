import { Tooltip as RTooltip } from "radix-ui";
import { type ReactElement, type ReactNode, useRef, useState } from "react";
import { Kbd } from "./Kbd";
import "./Tooltip.css";

export interface TooltipProps {
  content: ReactNode;
  /** Platform-neutral shortcut hint shown after the label, e.g. "mod+z". */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
  delay?: number;
}

/** Wrap the app once so tooltips share a delay group (Figma-style instant follow-on). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </RTooltip.Provider>
  );
}

/** Is a menu or popover opened by this trigger (or the control inside it) showing? */
const expanded = (el: Element) =>
  el.getAttribute("aria-expanded") === "true" || !!el.querySelector('[aria-expanded="true"]');

/** A disabled control (natively or focusable-disabled via aria-disabled). */
const inert = (el: Element) =>
  el.matches(':disabled, [aria-disabled="true"]') ||
  !!el.querySelector(':scope > :disabled, :scope > [aria-disabled="true"]');

/**
 * A tooltip explains a control before it's used. Once it's clicked (often opening a menu or
 * popover), the tooltip stays out of the way: it doesn't linger over the menu, and focus coming
 * back to the control when the menu closes doesn't bring it back. Pointing at the control again,
 * or leaving it with the keyboard, re-arms it.
 */
export function Tooltip({ content, shortcut, side = "bottom", children, delay }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const used = useRef(false);
  return (
    <RTooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (next && used.current) return;
        setOpen(next);
      }}
      delayDuration={delay}
    >
      <RTooltip.Trigger
        asChild
        onPointerDown={(e) => {
          // A disabled control does nothing when pressed: its tooltip (why it's off) stays useful.
          if (inert(e.currentTarget)) return;
          used.current = true;
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !inert(e.currentTarget)) setOpen(false);
        }}
        onPointerEnter={() => {
          used.current = false;
        }}
        onBlur={(e) => {
          // Focus moving into the menu it opened isn't "leaving"; tabbing away is.
          if (!expanded(e.currentTarget)) used.current = false;
        }}
      >
        {children}
      </RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="st-tooltip" side={side} sideOffset={6} collisionPadding={8}>
          <span>{content}</span>
          {shortcut && <Kbd shortcut={shortcut} className="st-tooltip__kbd" />}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
