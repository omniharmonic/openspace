import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog as RDialog } from "radix-ui";
import { useEffect, useMemo } from "react";
import "./CommandPalette.css";
import { allCommands, type PaletteCommand, useCommandStore } from "./command-store";
import { Kbd } from "./Kbd";
import { matchesShortcut } from "./shortcuts";
import "./surfaces.css";

/** Listens for ⌘K / Ctrl+K anywhere and toggles the palette. */
export function useCommandPaletteHotkey(shortcut = "mod+k") {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesShortcut(e, shortcut)) {
        e.preventDefault();
        useCommandStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);
}

function group(commands: PaletteCommand[]) {
  const map = new Map<string, PaletteCommand[]>();
  for (const c of commands) {
    const list = map.get(c.group) ?? [];
    list.push(c);
    map.set(c.group, list);
  }
  return [...map.entries()];
}

/** ⌘K command palette. Mount once; feed it with `useRegisterCommands`. */
export function CommandPalette() {
  useCommandPaletteHotkey();
  const open = useCommandStore((s) => s.open);
  const setOpen = useCommandStore((s) => s.setOpen);
  const sources = useCommandStore((s) => s.sources);
  const groups = useMemo(() => group(allCommands(sources)), [sources]);

  const run = (c: PaletteCommand) => {
    setOpen(false);
    // Let the dialog close (and return focus) before the command navigates or opens UI.
    queueMicrotask(c.run);
  };

  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <RDialog.Portal>
        <RDialog.Overlay className="st-palette__overlay" />
        <RDialog.Content className="st-palette st-pop" aria-describedby={undefined}>
          <RDialog.Title className="st-visually-hidden">Command palette</RDialog.Title>
          <Command label="Commands" loop>
            <div className="st-palette__search">
              <Search aria-hidden="true" />
              <Command.Input
                className="st-palette__input"
                placeholder="Search commands…"
                autoFocus
              />
              <Kbd shortcut="esc" tone="key" />
            </div>
            <Command.List className="st-palette__list">
              <Command.Empty className="st-palette__empty">No matching commands.</Command.Empty>
              {groups.map(([name, cmds]) => (
                <Command.Group key={name} heading={name} className="st-palette__group">
                  {cmds.map((c) => (
                    <Command.Item
                      key={c.id}
                      value={`${c.label} ${c.group} ${c.id}`}
                      keywords={c.keywords}
                      onSelect={() => run(c)}
                      className="st-menu__item st-palette__item"
                    >
                      {c.icon}
                      <span className="st-menu__label">{c.label}</span>
                      {c.shortcut && <Kbd shortcut={c.shortcut} />}
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
