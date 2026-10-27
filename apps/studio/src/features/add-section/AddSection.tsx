import type { Preset } from "@omniharmonic/openspace-blocks";
import type { Position } from "@omniharmonic/openspace-ops";
import { useState } from "react";
import { Button, Dialog, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useInspectorRole } from "../inspector/env";
import { canAddSections, isDesigner, type Role } from "../inspector/model/permissions";
import { RoleNote } from "../inspector/ui";
import { useAddSection } from "./blockMenuStore";
import {
  insertedBlockTypes,
  positionFromSelection,
  presetCommand,
  warnIfNeedsCloudflare,
} from "./insert";
import { PresetGallery } from "./PresetGallery";

/** Preset targets a role can't use: header/footer need a designer; contributors add none. */
export function blockedTargets(role: Role): Preset["target"][] {
  if (!canAddSections(role)) return ["page", "header", "footer"];
  return isDesigner(role) ? [] : ["header", "footer"];
}

function usePick() {
  const api = useDocStoreApi();
  const role = useInspectorRole();
  const [pendingFooter, setPendingFooter] = useState<{ preset: Preset; done?: () => void } | null>(
    null,
  );
  const apply = (preset: Preset, at?: Position) => {
    if (blockedTargets(role).includes(preset.target)) {
      toast({
        tone: "danger",
        title: "You can’t add that here",
        description:
          preset.target === "page"
            ? "Contributors write posts and events. Ask an editor to change pages."
            : "The header and footer are set by the site’s designer.",
      });
      return false;
    }
    const s = api.getState();
    const cmd = presetCommand(
      s.doc,
      s.pageId,
      preset,
      at ?? positionFromSelection(s.doc, s.pageId, s.selection),
    );
    const r = s.run(cmd);
    if (r.ok) warnIfNeedsCloudflare(s.doc, insertedBlockTypes(cmd));
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
  const pick = (preset: Preset, at?: Position, done?: () => void) => {
    if (preset.target === "footer" && !blockedTargets(role).includes("footer")) {
      setPendingFooter({ preset, ...(done ? { done } : {}) });
      return false;
    }
    return apply(preset, at);
  };
  const confirm = (
    <Dialog
      open={pendingFooter !== null}
      onOpenChange={(o) => !o && setPendingFooter(null)}
      title="Replace the footer?"
      description="Every page shares one footer. Its current content is replaced (you can undo this)."
      footer={
        <>
          <Button variant="ghost" onClick={() => setPendingFooter(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const p = pendingFooter;
              setPendingFooter(null);
              if (p && apply(p.preset)) p.done?.();
            }}
          >
            Replace footer
          </Button>
        </>
      }
    />
  );
  return { pick, confirm, role };
}

/** Left panel "Add section": the preset gallery, inserting after the selection. */
export function AddSectionPanel() {
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const { pick, confirm, role } = usePick();
  return (
    <>
      {!canAddSections(role) && (
        <RoleNote>Contributors write posts and events. Ask an editor to add sections.</RoleNote>
      )}
      <PresetGallery
        doc={doc}
        pageId={pageId}
        layout="panel"
        onPick={(p) => pick(p)}
        disabledTargets={blockedTargets(role)}
      />
      {confirm}
    </>
  );
}

/** The large gallery opened from a "+" between sections, inserting exactly there. */
export function AddSectionDialog() {
  const open = useAddSection((s) => s.open);
  const at = useAddSection((s) => s.at);
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const { pick, confirm, role } = usePick();
  const close = () => useAddSection.getState().close();
  return (
    <>
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
            disabledTargets={blockedTargets(role)}
            onPick={(p) => {
              if (pick(p, at ?? "end", close)) close();
            }}
          />
        )}
      </Dialog>
      {confirm}
    </>
  );
}
