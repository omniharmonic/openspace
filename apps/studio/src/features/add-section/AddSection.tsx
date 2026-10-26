import type { Preset } from "@openspace/blocks";
import type { Position } from "@openspace/ops";
import { Dialog, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useInspectorRole } from "../inspector/env";
import { isDesigner } from "../inspector/model/permissions";
import { useAddSection } from "./blockMenuStore";
import { positionFromSelection, presetCommand } from "./insert";
import { PresetGallery } from "./PresetGallery";

function usePick() {
  const api = useDocStoreApi();
  return (preset: Preset, at?: Position) => {
    const s = api.getState();
    const r = s.run(
      presetCommand(
        s.doc,
        s.pageId,
        preset,
        at ?? positionFromSelection(s.doc, s.pageId, s.selection),
      ),
    );
    if (!r.ok)
      toast({
        tone: "danger",
        title: "That section couldn’t be added",
        description: r.errors[0]?.message,
      });
    else if (preset.target === "header")
      toast({ title: "Header updated", description: "Every page uses the new header." });
    return r.ok;
  };
}

/** Left panel "Add section": the preset gallery, inserting after the selection. */
export function AddSectionPanel() {
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const pick = usePick();
  return (
    <PresetGallery
      doc={doc}
      pageId={pageId}
      layout="panel"
      onPick={(p) => pick(p)}
      disabledTargets={isDesigner(role) ? [] : ["header", "footer"]}
    />
  );
}

/** The large gallery opened from a "+" between sections, inserting exactly there. */
export function AddSectionDialog() {
  const open = useAddSection((s) => s.open);
  const at = useAddSection((s) => s.at);
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const pick = usePick();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && useAddSection.getState().close()}
      title="Add a section"
      description="Every design is shown in your site’s colors and fonts."
      width={960}
      className="st-gal-dialog"
    >
      {open && (
        <PresetGallery
          doc={doc}
          pageId={pageId}
          layout="dialog"
          disabledTargets={isDesigner(role) ? [] : ["header", "footer"]}
          onPick={(p) => {
            if (pick(p, at ?? "end")) useAddSection.getState().close();
          }}
        />
      )}
    </Dialog>
  );
}
