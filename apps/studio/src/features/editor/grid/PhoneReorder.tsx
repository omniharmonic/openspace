import { ArrowDown, ArrowUp } from "lucide-react";
import { IconButton, Sheet } from "../../../ui";
import { useInspectorRole } from "../../inspector/env";
import { BlockIcon } from "../blockIcons";
import { useDocStore, useDocStoreApi } from "../model/context";
import { blockName } from "../model/selection";
import { gridCaps } from "./caps";
import { mobileOrder, mobileReorderCommand } from "./commands";
import { type GridSection, isGridSection } from "./model";

/**
 * Phones (FR-22): no free placement on a small touch screen. Instead, a plain list of the
 * section's blocks in phone order with move up/down; each move restacks the phone layout
 * (`m` placements only), one undo step.
 */
export function PhoneReorder({
  section: initial,
  open,
  onOpenChange,
}: {
  section: GridSection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useDocStoreApi();
  const role = useInspectorRole();
  // Follow the live section (each move changes it).
  const section = useDocStore((s) => {
    const page = s.doc.pages[s.pageId as keyof typeof s.doc.pages];
    const found = [...(page?.sections ?? []), s.doc.site.footer].find((x) => x.id === initial.id);
    return isGridSection(found) ? found : initial;
  });
  const caps = gridCaps(role, section);
  const order = mobileOrder(section);
  const byId = new Map(section.blocks.map((b) => [b.id as string, b]));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    const s = api.getState();
    s.run(mobileReorderCommand(s.doc, s.pageId, section.id, next));
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Order on phones">
      {!caps.edit && <p className="st-grid__reorder-note">{caps.reason}</p>}
      <ol className="st-grid__reorder" aria-label="Blocks in phone order">
        {order.map((id, i) => {
          const b = byId.get(id);
          if (!b) return null;
          const name = blockName(b);
          return (
            <li key={id} className="st-grid__reorder-row">
              <BlockIcon type={b.type} />
              <span className="st-grid__reorder-name">{name}</span>
              <IconButton
                size="sm"
                label={`Move ${name} up`}
                icon={<ArrowUp />}
                disabled={!caps.edit || i === 0}
                onClick={() => move(i, -1)}
              />
              <IconButton
                size="sm"
                label={`Move ${name} down`}
                icon={<ArrowDown />}
                disabled={!caps.edit || i === order.length - 1}
                onClick={() => move(i, 1)}
              />
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
