import { Check, Columns2, X } from "lucide-react";
import { memo, useDeferredValue, useEffect, useState } from "react";
import { useTemplateDetail, useTemplates } from "../../api";
import type { TemplateSummary } from "../../api/types";
import { Button, cx, EmptyState, Segmented, Skeleton, Toggle, toast } from "../../ui";
import { useEditorUi } from "../editor/editor-store";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import type { EditorStore } from "../editor/model/store";
import { useInspectorRole } from "../inspector/env";
import { isDesigner } from "../inspector/model/permissions";
import { useCanvasImageMap } from "../media/sources";
import { SiteRender } from "../templates/LiveRender";
import { LookPicker } from "../templates/LookPicker";
import { type LookResult, useLookResult, useLookTrial } from "./trial";
import "./looks.css";

/** Commit a look as one undo step. */
export function applyLook(
  store: EditorStore,
  result: LookResult,
  name: string,
): "applied" | "unchanged" | "failed" {
  if (!result.bodies.length) return "unchanged";
  const label = `Use the ${name} look`;
  const r = store.getState().commit(result.bodies, { label });
  if (!r.ok) {
    toast({ tone: "danger", title: "Couldn’t apply the look", description: r.errors[0]?.message });
    return "failed";
  }
  toast({
    tone: "success",
    title: `${name} look applied`,
    description: "Your words and photos stayed; the styles changed.",
    action: { label: "Undo", onClick: () => store.getState().undo() },
  });
  return "applied";
}

const LookCard = memo(function LookCard({ template }: { template: TemplateSummary }) {
  // Typing elsewhere never waits on a dozen look previews: they follow the page lazily.
  const doc = useDeferredValue(useDocStore((s) => s.doc));
  const pageId = useDocStore((s) => s.pageId);
  const trial = useLookTrial();
  const active = trial.templateId === template.id;
  const [lookId, setLookId] = useState(template.looks[0]?.id ?? "");
  const [visible, setVisible] = useState(false);
  const detail = useTemplateDetail(template.id, { enabled: visible || active });
  const shownLook = active && trial.lookId ? trial.lookId : lookId;
  // Only cards on screen (or the one being tried) compute their preview.
  const result = useLookResult(
    doc,
    visible || active ? detail.data : undefined,
    shownLook,
    trial.keepTweaks,
  );
  const imageMap = useCanvasImageMap(doc.media);
  const look = template.looks.find((l) => l.id === shownLook) ?? template.looks[0];
  if (!look) return null;
  const pick = (id: string) => {
    setLookId(id);
    if (active) trial.tryLook(template.id, id);
  };
  return (
    <article
      className={cx("st-lk__card", active && "is-active")}
      aria-labelledby={`st-lk-${template.id}`}
    >
      <button
        type="button"
        className="st-lk__try"
        aria-label={`Try ${template.name}, ${look.name} look, on your site`}
        aria-pressed={active}
        onClick={() => trial.tryLook(template.id, look.id)}
      >
        <SiteRender
          doc={result?.doc}
          pageId={pageId}
          frameWidth={1440}
          aspect={0.62}
          imageMap={imageMap}
          title={`Your page in ${template.name}, ${look.name} look`}
          onVisibleChange={setVisible}
        />
      </button>
      <div className="st-lk__row">
        <h3 id={`st-lk-${template.id}`} className="st-lk__name">
          {template.name}
          {active && <Check aria-label="Previewing" className="st-lk__on" />}
        </h3>
        <LookPicker
          looks={template.looks}
          value={look.id}
          onValueChange={pick}
          label={`${template.name} looks`}
        />
      </div>
      <p className="st-lk__mood">{template.mood}</p>
    </article>
  );
});

/** The left panel: every template × look, drawn with this site's own content. */
export function LooksPanel() {
  const templates = useTemplates();
  const role = useInspectorRole();
  return (
    <div className="st-lk" data-testid="looks-panel">
      <p className="st-lk__intro">
        See your pages in another template’s style. Your words, photos and pages stay as they are;
        only colors, fonts and section styles change.
        {!isDesigner(role) && " Only owners and designers can apply a new look."}
      </p>
      {templates.isPending ? (
        <div className="st-lk__list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={170} />
          ))}
        </div>
      ) : templates.isError ? (
        <EmptyState
          size="sm"
          title="Templates didn’t load"
          description={templates.error.message}
          action={<Button onClick={() => templates.refetch()}>Try again</Button>}
        />
      ) : (
        <div className="st-lk__list">
          {templates.data.map((t) => (
            <LookCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The canvas while a look is being tried: the current page now and with the new look, side
 * by side (one at a time on phones), with Apply and Discard. Nothing changes until Apply.
 */
export function LookStage({ narrow = false }: { narrow?: boolean }) {
  const trial = useLookTrial();
  const templates = useTemplates();
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const breakpoint = useEditorUi((s) => s.breakpoint);
  const role = useInspectorRole();
  const template = templates.data?.find((t) => t.id === trial.templateId);
  const detail = useTemplateDetail(trial.templateId ?? undefined);
  const result = useLookResult(doc, detail.data, trial.lookId, trial.keepTweaks);
  const imageMap = useCanvasImageMap(doc.media);
  const discard = trial.discard;

  useEffect(() => {
    if (!trial.templateId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") discard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trial.templateId, discard]);

  if (!trial.templateId || !template) return null;
  const look = template.looks.find((l) => l.id === trial.lookId) ?? template.looks[0];
  if (!look) return null;
  const width = narrow
    ? 390
    : breakpoint === "desktop"
      ? 1440
      : breakpoint === "tablet"
        ? 834
        : 390;
  const name = `${template.name} ${look.name}`;
  const canApply = isDesigner(role) && Boolean(result);
  const changes = result ? result.plan.matches.filter((m) => m.page !== "footer").length : 0;
  const apply = () => {
    if (!result) return;
    const r = applyLook(api, result, name);
    if (r === "unchanged") toast({ title: "That’s already your look" });
    if (r !== "failed") discard();
  };

  const pane = (which: "now" | "new") => (
    <figure className="st-lk-stage__pane" key={which}>
      <figcaption className="st-lk-stage__cap">
        {which === "now" ? "Now" : `With ${template.name} · ${look.name}`}
      </figcaption>
      <div className="st-lk-stage__screen">
        <SiteRender
          doc={which === "now" ? doc : result?.doc}
          pageId={pageId}
          frameWidth={width}
          aspect="fill"
          interactive
          imageMap={imageMap}
          title={which === "now" ? "Your page now" : `Your page with the ${name} look`}
        />
      </div>
    </figure>
  );

  return (
    <section className="st-lk-stage" aria-label="Try a new look">
      <div className="st-lk-stage__bar">
        <div className="st-lk-stage__title">
          <Columns2 aria-hidden="true" />
          <span>
            Trying <strong>{template.name}</strong>
          </span>
          <LookPicker
            looks={template.looks}
            value={look.id}
            onValueChange={(id) => trial.tryLook(template.id, id)}
            label={`${template.name} looks`}
            showNames={!narrow}
          />
        </div>
        {doc.styles.overrides && (
          <label className="st-lk-stage__keep" htmlFor="st-lk-keep">
            <Toggle
              id="st-lk-keep"
              size="sm"
              checked={trial.keepTweaks}
              onCheckedChange={trial.setKeepTweaks}
            />
            Keep my color and font tweaks
          </label>
        )}
        {result && !narrow && (
          <span className="st-lk-stage__meta">
            {changes > 0
              ? `${changes} ${changes === 1 ? "section follows" : "sections follow"} the template${
                  result.plan.unmatched.length
                    ? ` · ${result.plan.unmatched.length} keep their own style`
                    : ""
                }`
              : "Colors, fonts and buttons change; your sections keep their layouts"}
          </span>
        )}
        <span className="st-lk-stage__spacer" />
        <Button variant="ghost" size="sm" icon={<X />} onClick={discard}>
          Discard
        </Button>
        <Button variant="primary" size="sm" disabled={!canApply} onClick={apply}>
          Apply look
        </Button>
      </div>
      {narrow && (
        <Segmented<"now" | "new">
          aria-label="Compare"
          size="sm"
          block
          className="st-lk-stage__switch"
          value={trial.side}
          onValueChange={trial.setSide}
          options={[
            { value: "now", label: "Now" },
            { value: "new", label: `With ${template.name}` },
          ]}
        />
      )}
      <div className={cx("st-lk-stage__panes", narrow && "is-single")}>
        {narrow ? pane(trial.side) : [pane("now"), pane("new")]}
      </div>
      {detail.isError && (
        <p className="st-lk-stage__error" role="alert">
          This template couldn’t be loaded. Check your connection and try again.
        </p>
      )}
    </section>
  );
}
