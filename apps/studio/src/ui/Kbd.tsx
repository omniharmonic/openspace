import { cx } from "./cx";
import "./Kbd.css";
import { type Platform, shortcutKeys } from "./shortcuts";

export interface KbdProps {
  /** Platform-neutral shortcut, e.g. "mod+k". */
  shortcut: string;
  platform?: Platform;
  /** "muted" sits inside menus and tooltips; "key" draws keycaps. */
  tone?: "muted" | "key";
  className?: string;
}

/** Renders a keyboard shortcut as individual keys. */
export function Kbd({ shortcut, platform, tone = "muted", className }: KbdProps) {
  const keys = shortcutKeys(shortcut, platform);
  return (
    <kbd className={cx("st-kbd", `st-kbd--${tone}`, className)}>
      {keys.map((k, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: keys are positional
        <kbd key={i} className="st-kbd__key">
          {k}
        </kbd>
      ))}
    </kbd>
  );
}
