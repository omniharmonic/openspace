import { Dialog, Kbd } from "../../../ui";
import { useEditorUi } from "../editor-store";
import { EDITOR_SHORTCUTS } from "../shortcuts";

const GROUPS = ["Edit", "Select", "View", "Panels"] as const;

/** The `?` sheet: every editor shortcut, grouped. */
export function ShortcutsSheet() {
  const open = useEditorUi((s) => s.shortcutsOpen);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useEditorUi.getState().setShortcutsOpen(o)}
      title="Keyboard shortcuts"
      width={620}
    >
      <div className="st-keys">
        {GROUPS.map((g) => (
          <section key={g} className="st-keys__group" aria-label={g}>
            <h3>{g}</h3>
            <dl>
              {EDITOR_SHORTCUTS.filter((d) => d.group === g).map((d) => (
                <div key={d.label} className="st-keys__row">
                  <dt>{d.label}</dt>
                  <dd>
                    {d.keys.slice(0, 1).map((k) => (
                      <Kbd key={k} shortcut={k} />
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
