import { Tooltip as RTooltip } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
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

export function Tooltip({ content, shortcut, side = "bottom", children, delay }: TooltipProps) {
  return (
    <RTooltip.Root delayDuration={delay}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="st-tooltip" side={side} sideOffset={6} collisionPadding={8}>
          <span>{content}</span>
          {shortcut && <Kbd shortcut={shortcut} className="st-tooltip__kbd" />}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
