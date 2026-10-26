import { Check } from "lucide-react";
import { useState } from "react";
import { Button, cx, Dialog, Field, Input, Toggle, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useManageUi } from "../site-mgmt/manage-ui";
import "./pages.css";
import { createPage, normalizeSlug, slugify, slugProblem, uniqueSlug } from "./pageOps";
import { PAGE_TEMPLATES, type PageTemplate } from "./pageTemplates";

const OUTLINE_LABEL: Record<PageTemplate["outline"][number], string> = {
  hero: "Large heading",
  text: "Text",
  columns: "Columns",
  image: "Image",
  form: "Form",
  list: "List",
  links: "Links",
  band: "Band",
};

/** Wireframe thumbnail of a template's sections (drawn, so it follows light and dark chrome). */
function Outline({ template }: { template: PageTemplate }) {
  return (
    <span className="st-tpl__thumb" aria-hidden="true">
      {template.outline.map((kind, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static outline
        <span key={i} className={cx("st-tpl__band", `st-tpl__band--${kind}`)}>
          {kind === "columns" || kind === "list" ? (
            <>
              <i />
              <i />
              <i />
            </>
          ) : kind === "form" ? (
            <>
              <i />
              <b />
            </>
          ) : kind === "links" ? (
            <>
              <i />
              <i />
              <i />
              <i />
            </>
          ) : (
            <i />
          )}
        </span>
      ))}
    </span>
  );
}

/** "Add page": pick a page template, name it, choose whether it joins the navigation. */
export function AddPageDialog() {
  const req = useManageUi((s) => s.addPage);
  const close = () => useManageUi.getState().openAddPage(null);
  return (
    <Dialog
      open={Boolean(req)}
      onOpenChange={(o) => !o && close()}
      title="Add a page"
      width={760}
      className="st-page-dialog"
    >
      {req && <AddPageForm after={req.after} onClose={close} />}
    </Dialog>
  );
}

function AddPageForm({ after, onClose }: { after?: string; onClose: () => void }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const [templateId, setTemplateId] = useState("blank");
  const template =
    PAGE_TEMPLATES.find((t) => t.id === templateId) ?? (PAGE_TEMPLATES[0] as PageTemplate);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [addToNav, setAddToNav] = useState(true);
  const name = title.trim() || template.title;
  const effectiveSlug = slugEdited ? normalizeSlug(slug) : uniqueSlug(doc, slugify(name));
  const problem = effectiveSlug ? slugProblem(doc, effectiveSlug) : "Give the page an address.";

  const create = () => {
    if (problem) return;
    const cmd = createPage(doc, template, { title: name, slug: effectiveSlug, addToNav, after });
    const res = api.getState().commit(cmd.bodies, { label: cmd.label });
    if (!res.ok) {
      toast({
        tone: "danger",
        title: "Couldn’t add the page",
        description: res.errors[0]?.message,
      });
      return;
    }
    api.getState().setPage(cmd.pageId);
    toast({ tone: "success", title: `“${name}” added`, description: "Undo with ⌘Z." });
    onClose();
  };

  return (
    <form
      className="st-addpage"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <fieldset className="st-tpl">
        <legend className="st-visually-hidden">Page template</legend>
        {PAGE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.id === templateId}
            className={cx("st-tpl__item", t.id === templateId && "is-selected")}
            onClick={() => setTemplateId(t.id)}
          >
            <Outline template={t} />
            <span className="st-tpl__name">
              {t.label}
              {t.id === templateId && <Check aria-hidden="true" />}
            </span>
            <span className="st-tpl__desc">{t.description}</span>
            <span className="st-visually-hidden">
              {t.outline.map((o) => OUTLINE_LABEL[o]).join(", ")}
            </span>
          </button>
        ))}
      </fieldset>
      <div className="st-addpage__fields">
        <Field label="Page name">
          <Input
            value={title}
            placeholder={template.title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            data-autofocus
          />
        </Field>
        <Field label="Address" error={problem}>
          <Input
            prefix="/"
            value={slugEdited ? slug : effectiveSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value);
            }}
          />
        </Field>
        <div className="st-switch-row">
          <span className="st-switch-row__label" id="addpage-nav">
            Show in navigation
          </span>
          <Toggle
            checked={addToNav}
            onCheckedChange={setAddToNav}
            aria-label="Show in navigation"
          />
        </div>
      </div>
      <div className="st-page-form__foot">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={Boolean(problem)}>
          Add page
        </Button>
      </div>
    </form>
  );
}
