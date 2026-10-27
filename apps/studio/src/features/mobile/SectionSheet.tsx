import { blockText } from "@omniharmonic/openspace-lint";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ListOrdered,
  Plus,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import type { Site } from "../../api/types";
import { Button, IconButton, Spinner, toast } from "../../ui";
import { useBlockMenu } from "../add-section/blockMenuStore";
import { BlockIcon } from "../editor/blockIcons";
import { gridCaps } from "../editor/grid/caps";
import { isGridSection } from "../editor/grid/model";
import { PhoneReorder } from "../editor/grid/PhoneReorder";
import { deleteItems, duplicateItems, moveSectionTo, toggleHidden } from "../editor/model/actions";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { blockName, sectionLabel } from "../editor/model/selection";
import { useInspectorRole } from "../inspector/env";
import { Inspector } from "../inspector/Inspector";
import { capabilities } from "../inspector/model/permissions";
import { useUploader } from "../media/useUploader";
import { blockImageAlt, imageFieldOf, setBlockImage, waitForMedia } from "./replaceImage";
import "./mobile.css";

function ReplacePhoto({
  site,
  container,
  blockId,
}: {
  site: Site;
  container: string;
  blockId: string;
}) {
  const api = useDocStoreApi();
  const uploader = useUploader(site);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file || !uploader) return;
    setBusy(true);
    try {
      const [res] = await uploader.add([file]);
      if (!res) return;
      const meta = await waitForMedia(api, res.path);
      if (!meta) {
        toast({
          title: "Your photo is still uploading",
          description: "It will be in Media when it’s done; choose it from there.",
        });
        return;
      }
      const previousAlt = blockImageAlt(api, container, blockId).trim();
      const err = setBlockImage(api, container, blockId, res.path);
      if (err) toast({ tone: "danger", title: "Couldn’t use that photo", description: err });
      else
        toast({
          tone: "success",
          title: "Photo replaced",
          description: "Describe the new photo in its alt text, for people using screen readers.",
          ...(previousAlt
            ? {
                action: {
                  label: "Keep old description",
                  onClick: () =>
                    void setBlockImage(api, container, blockId, res.path, { alt: previousAlt }),
                },
              }
            : {}),
        });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={busy ? <Spinner size={12} /> : <Camera />}
        disabled={busy || !uploader}
        onClick={() => input.current?.click()}
      >
        {busy ? "Adding…" : "Replace photo"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        data-testid={`replace-photo-${blockId}`}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </>
  );
}

export function SectionSheetBody({
  site,
  sectionId,
  blockId,
  onBlock,
  onClose,
}: {
  site: Site;
  sectionId: string;
  blockId: string | undefined;
  onBlock: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const [reorder, setReorder] = useState(false);
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const footer = doc.site.footer.id === sectionId;
  const index = page?.sections.findIndex((s) => s.id === sectionId) ?? -1;
  const section = footer ? doc.site.footer : page?.sections[index];
  if (!section) return <p className="st-mob__lede">This section was removed.</p>;
  const container = footer ? "footer" : pageId;
  const caps = capabilities(role, section);
  const s = () => api.getState();

  if (blockId && section.blocks.some((b) => b.id === blockId)) {
    return (
      <div className="st-mob__blockedit">
        <button type="button" className="st-mob__back" onClick={() => onBlock(undefined)}>
          <ArrowLeft aria-hidden="true" /> {sectionLabel(doc, section, index)}
        </button>
        <Inspector />
      </div>
    );
  }

  const count = page?.sections.length ?? 0;
  const sel = [{ kind: "section" as const, id: section.id as string }];
  return (
    <div className="st-mob__sectionedit">
      {!footer && caps.structure && (
        <div className="st-mob__toolbar" role="toolbar" aria-label="Section">
          <IconButton
            label="Move up"
            icon={<ArrowUp />}
            tooltip={false}
            disabled={index <= 0}
            onClick={() => s().run(moveSectionTo(pageId, section.id, index - 1))}
          />
          <IconButton
            label="Move down"
            icon={<ArrowDown />}
            tooltip={false}
            disabled={index >= count - 1}
            onClick={() => s().run(moveSectionTo(pageId, section.id, index + 1))}
          />
          <IconButton
            label="Duplicate"
            icon={<Copy />}
            tooltip={false}
            onClick={() => s().run(duplicateItems(s().doc, pageId, sel))}
          />
          <IconButton
            label={section.hidden ? "Show on the site" : "Hide on the site"}
            icon={section.hidden ? <Eye /> : <EyeOff />}
            tooltip={false}
            disabled={!caps.sectionDesign}
            onClick={() => s().run(toggleHidden(s().doc, pageId, section))}
          />
          <IconButton
            label="Delete section"
            icon={<Trash2 />}
            tooltip={false}
            onClick={() => {
              s().run(deleteItems(s().doc, pageId, sel));
              onClose();
              toast({
                title: "Section deleted",
                action: { label: "Undo", onClick: () => api.getState().undo() },
              });
            }}
          />
        </div>
      )}
      <ul className="st-mob__list" aria-label="Blocks in this section">
        {section.blocks.map((b) => {
          const text = blockText(b).replace(/\s+/g, " ").trim();
          const photo = imageFieldOf(b);
          return (
            <li key={b.id} className="st-mob__brow">
              <button
                type="button"
                className="st-mob__row"
                onClick={() => {
                  s().select({ kind: "block", id: b.id });
                  onBlock(b.id);
                }}
              >
                <BlockIcon type={b.type} />
                <span className="st-mob__row-text">
                  <span className="st-mob__row-title">{blockName(b)}</span>
                  {text && <span className="st-mob__row-sub">{text}</span>}
                </span>
                <ChevronRight aria-hidden="true" className="st-mob__chev" />
              </button>
              {photo && caps.field("image") && (
                <div className="st-mob__rowaction">
                  <ImageIcon aria-hidden="true" />
                  <ReplacePhoto site={site} container={container} blockId={b.id} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="st-mob__actions">
        {caps.structure && (
          <Button
            variant="secondary"
            icon={<Plus />}
            onClick={() => useBlockMenu.getState().openFor({ section: section.id })}
          >
            Add block
          </Button>
        )}
        {isGridSection(section) && (
          <>
            <Button variant="secondary" icon={<ListOrdered />} onClick={() => setReorder(true)}>
              Order on phones
            </Button>
            <PhoneReorder section={section} open={reorder} onOpenChange={setReorder} />
          </>
        )}
      </div>
      {isGridSection(section) && !gridCaps(role, section).edit && (
        <p className="st-mob__lede">{gridCaps(role, section).reason}</p>
      )}
    </div>
  );
}
