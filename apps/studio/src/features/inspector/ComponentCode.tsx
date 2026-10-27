import { BLOCKS_CSS } from "@omniharmonic/openspace-blocks";
import { componentPreview, renderPageHtml } from "@omniharmonic/openspace-renderer";
import {
  type Block,
  type ComponentDefinition,
  checkComponent,
  componentInstances,
  componentNameOf,
  describeComponentIssues,
} from "@omniharmonic/openspace-schema";
import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Dialog, Tabs, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useCanvasImageMap } from "../media/sources";
import { CodeEditor } from "../settings/CodeEditor";
import { PanelSection } from "./ui";

/**
 * "Component code" (ADR custom-components §5): designers and owners edit a custom component's
 * template, CSS, JavaScript and fields here, with plain-language validation and a live preview in
 * a sandboxed frame (scripts run with an opaque origin, never in the editor canvas). Owners and
 * editors change the section through its fields above; this panel isn't shown to them, and the
 * Hub refuses component changes from their roles.
 */

type Part = "template" | "css" | "js" | "fields" | "defaults";

interface Draft {
  label: string;
  template: string;
  css: string;
  js: string;
  fields: string;
  defaults: string;
}

const toDraft = (def: ComponentDefinition): Draft => ({
  label: def.label,
  template: def.template,
  css: def.css ?? "",
  js: def.js ?? "",
  fields: JSON.stringify(def.fields, null, 2),
  defaults: JSON.stringify(def.defaults, null, 2),
});

/** The definition a draft describes, or the JSON parts that don't parse. */
export function draftToDefinition(
  base: ComponentDefinition,
  d: Draft,
): { def: ComponentDefinition } | { problems: string[] } {
  const problems: string[] = [];
  const parse = (text: string, what: string) => {
    try {
      const v = JSON.parse(text) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
      problems.push(`${what}: expected a JSON object like { "headline": … }`);
    } catch (e) {
      problems.push(`${what}: ${(e as Error).message}`);
    }
    return undefined;
  };
  const fields = parse(d.fields, "Fields");
  const defaults = parse(d.defaults, "Sample content");
  if (problems.length || !fields || !defaults) return { problems };
  const def: ComponentDefinition = {
    ...base,
    label: d.label.trim() || base.label,
    template: d.template,
    fields: fields as ComponentDefinition["fields"],
    defaults,
  };
  if (d.css.trim()) def.css = d.css;
  else delete def.css;
  if (d.js.trim()) def.js = d.js;
  else delete def.js;
  return { def };
}

function ComponentCodeDialog({
  def,
  open,
  onOpenChange,
}: {
  def: ComponentDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const imageMap = useCanvasImageMap(doc.media);
  const [draft, setDraft] = useState<Draft>(() => toDraft(def));
  const [tab, setTab] = useState<Part>("template");
  const [saveError, setSaveError] = useState<string | null>(null);
  const set = (part: keyof Draft) => (v: string) => {
    setDraft((d) => ({ ...d, [part]: v }));
    setSaveError(null);
  };
  const candidate = useMemo(() => draftToDefinition(def, draft), [def, draft]);
  const issues = useMemo(() => {
    if ("problems" in candidate) return candidate.problems;
    const r = checkComponent(candidate.def);
    return r.ok ? [] : describeComponentIssues(r.issues);
  }, [candidate]);
  const preview = useMemo(() => {
    if ("problems" in candidate || issues.length) return null;
    try {
      const p = componentPreview(doc, candidate.def);
      return renderPageHtml({
        doc: p.doc,
        pageId: p.page.id,
        mode: "preview",
        imageMap,
        extraHead: `<style>${BLOCKS_CSS}</style>`,
      });
    } catch {
      return null;
    }
  }, [candidate, issues, doc, imageMap]);
  const used = componentInstances(doc, def.name).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(def));

  const save = () => {
    if ("problems" in candidate || issues.length) return;
    const r = api
      .getState()
      .commit([{ op: "component.upsert", component: candidate.def } as never], {
        label: `Change the ${candidate.def.label} design`,
      });
    if (!r.ok) {
      const first = r.errors[0]?.message ?? "";
      setSaveError(
        /would break/.test(first)
          ? `${first}. Keep the fields compatible (add optional fields, keep kinds), or ask Claude to update the component with a migration.`
          : first || "That change couldn’t be saved.",
      );
      return;
    }
    toast({ tone: "success", title: `${candidate.def.label} updated` });
    onOpenChange(false);
  };

  const editor = (part: Part) => {
    const language = part === "template" ? "html" : part === "css" ? "css" : "plain";
    const labels: Record<Part, string> = {
      template: "Template",
      css: "CSS",
      js: "JavaScript",
      fields: "Fields (JSON)",
      defaults: "Sample content (JSON)",
    };
    return (
      <CodeEditor
        value={draft[part]}
        onChange={set(part)}
        language={language}
        label={labels[part]}
        minHeight={260}
      />
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Component code — ${def.label}`}
      description={`Used by ${used} section${used === 1 ? "" : "s"}. Owners edit this section through its fields; changes here restyle every section that uses it.`}
      width={1120}
      className="st-cc"
      footer={
        <>
          <Button variant="ghost" onClick={() => setDraft(toDraft(def))} disabled={!dirty}>
            Revert
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty || issues.length > 0}>
            Save design
          </Button>
        </>
      }
    >
      <div className="st-cc__body">
        <div className="st-cc__code">
          <label className="st-cc__name">
            <span>Name in the gallery</span>
            <input
              className="st-input st-input--sm st-ip-plaininput"
              value={draft.label}
              maxLength={60}
              onChange={(e) => set("label")(e.target.value)}
            />
          </label>
          <Tabs
            aria-label="Component code"
            value={tab}
            onValueChange={(v) => setTab(v as Part)}
            items={(["template", "css", "js", "fields", "defaults"] as const).map((p) => ({
              value: p,
              label:
                p === "template"
                  ? "Template"
                  : p === "css"
                    ? "CSS"
                    : p === "js"
                      ? "JavaScript"
                      : p === "fields"
                        ? "Fields"
                        : "Sample content",
              content: editor(p),
            }))}
          />
          {(issues.length > 0 || saveError) && (
            <div
              className="st-callout st-callout--danger"
              role="alert"
              data-testid="component-issues"
            >
              <TriangleAlert aria-hidden="true" />
              <ul className="st-cc__issues">
                {saveError && <li>{saveError}</li>}
                {issues.slice(0, 8).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="st-muted-note">
            JavaScript runs on the published site only, never in the editor. Use theme variables
            (var(--os-color-text), var(--os-font-heading), var(--os-space-lg)) so Site Styles keep
            working.
          </p>
        </div>
        <div className="st-cc__preview">
          {preview ? (
            <iframe
              title={`${def.label} preview`}
              // Scripts run with an opaque origin: no access to Studio, cookies or storage.
              sandbox="allow-scripts"
              srcDoc={preview}
              className="st-cc__frame"
              data-testid="component-preview"
            />
          ) : (
            <p className="st-cc__empty">Fix the problems on the left to see the preview.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** The "Component code" panel for a component instance (designers and owners only). */
export function ComponentCodePanel({ block }: { block: Block }) {
  const name = componentNameOf(block.type);
  const def = useDocStore((s) => (name ? s.doc.components?.[name] : undefined));
  const [open, setOpen] = useState(false);
  if (!name || !def) return null;
  return (
    <PanelSection title="Component code" defaultOpen={false}>
      <p className="st-ip-note">
        This designer section has its own template, styles and behaviour. Its words and pictures are
        the fields above.
      </p>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Edit component code
      </Button>
      {open && <ComponentCodeDialog def={def} open={open} onOpenChange={setOpen} />}
    </PanelSection>
  );
}
