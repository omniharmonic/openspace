import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { useState } from "react";
import { Button, Dialog, Field, Input, Select } from "../../ui";
import { sectionTitle } from "./sectionEntry";

export interface SectionLinkValue {
  label: string;
  page: string;
  section: string;
}

/**
 * "A section of a page" as a menu entry: the words in the menu, the page, and the section the
 * entry scrolls to (on phones too). Used to add one and to fix or change one.
 */
export function SectionLinkDialog({
  doc,
  initial,
  editing,
  onClose,
  onSave,
}: {
  doc: SiteDocument;
  initial: Partial<SectionLinkValue>;
  editing: boolean;
  onClose: () => void;
  onSave: (v: SectionLinkValue) => void;
}) {
  const pages = Object.values(doc.pages);
  const home = pages.find((p) => p.slug === "") ?? pages[0];
  const [label, setLabel] = useState(initial.label ?? "");
  const [pageId, setPageId] = useState(initial.page ?? home?.id ?? "");
  const [sectionId, setSectionId] = useState(initial.section ?? "");
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const sections = page?.sections.filter((s) => !s.hidden) ?? [];
  const chosen = sections.some((s) => s.id === sectionId) ? sectionId : undefined;
  const ok = label.trim().length > 0 && label.trim().length <= 60 && Boolean(page && chosen);
  const save = () => {
    if (!ok || !chosen) return;
    onSave({ label: label.trim(), page: pageId, section: chosen });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? "Edit menu link" : "Add a link to a section"}
      description="The menu entry scrolls to this part of the page — on computers and in the phone menu."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="st-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Label" hint="What visitors see in the menu.">
          <Input
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            data-autofocus
          />
        </Field>
        <Field label="Page">
          <Select
            aria-label="Page"
            value={pageId || undefined}
            placeholder="Choose a page"
            onValueChange={(v) => {
              setPageId(v);
              setSectionId("");
            }}
            options={pages.map((p) => ({ value: p.id, label: p.title }))}
          />
        </Field>
        <Field
          label="Section"
          hint={sections.length ? undefined : "This page has no sections yet."}
        >
          <Select
            aria-label="Section"
            value={chosen}
            placeholder="Choose a section"
            onValueChange={setSectionId}
            options={sections.map((s) => ({
              value: s.id,
              label: page ? sectionTitle(page, s) : s.id,
            }))}
          />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
