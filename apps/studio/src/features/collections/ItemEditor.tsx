import { blocksRegistry } from "@openspace/blocks";
import { seoCheck, sortIssues } from "@openspace/lint";
import type { Block, CollectionItem, Page, SiteDocument } from "@openspace/schema";
import { itemPage } from "@openspace/site-kit/pages";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Monitor,
  MoreHorizontal,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { canonicalJson } from "../../api/canonical";
import type { Site } from "../../api/types";
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Menu,
  Segmented,
  TextArea,
  toast,
} from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { slugify } from "../pages/pageOps";
import { can } from "../site-mgmt/manage-ui";
import { dateTime } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { ConfirmDialog } from "../workspace/ui";
import { BodyEditor } from "./BodyEditor";
import {
  BlogFields,
  CoverFields,
  EventFields,
  type FrontmatterProps,
  PodcastFields,
  PortfolioFields,
  ProductFields,
  TaxonomyFields,
} from "./FrontmatterFields";
import {
  configOps,
  deleteItemOps,
  duplicateItem,
  effectiveStatus,
  fromInputDateTime,
  itemProblems,
  localDateTime,
  newItem,
  saveItemOps,
  toInputDateTime,
  uniqueItemSlug,
} from "./itemOps";
import type { CollectionInfo } from "./kinds";
import { blocksToMarkdoc, markdocToEditorBlocks } from "./markdoc";
import { PreviewFrame } from "./PreviewFrame";
import { StatusBadge } from "./StatusBadge";

interface Draft {
  item: CollectionItem;
  blocks: Block[];
  /** The body could not be read as blocks: edit it as text instead. */
  raw: string | null;
}

function draftFrom(item: CollectionItem): Draft {
  const parsed = markdocToEditorBlocks(item.body, { idSeed: `${item.kind}/${item.slug}` });
  return parsed.issues.length
    ? { item, blocks: [], raw: item.body }
    : { item, blocks: parsed.blocks, raw: null };
}

function itemWithBody(d: Draft): CollectionItem {
  return { ...d.item, body: d.raw ?? blocksToMarkdoc(d.blocks) } as CollectionItem;
}

const key = (item: CollectionItem | undefined) => (item ? canonicalJson(item) : "");

const FORMS: Record<CollectionItem["kind"], (p: FrontmatterProps) => React.ReactNode> = {
  blog: (p) => <BlogFields {...p} />,
  events: (p) => <EventFields {...p} />,
  portfolio: (p) => <PortfolioFields {...p} />,
  podcast: (p) => <PodcastFields {...p} />,
  products: (p) => <ProductFields {...p} />,
};

const DETAIL_TITLE: Record<CollectionItem["kind"], string> = {
  blog: "Post details",
  events: "When and where",
  portfolio: "Project details",
  podcast: "Episode",
  products: "Price, options and stock",
};

/** The item editor: title and body on the left, details on the right, live preview on demand. */
export function ItemEditor({
  site,
  info,
  slug,
}: {
  site: Site;
  info: CollectionInfo;
  /** null = a new item. */
  slug: string | null;
}) {
  const navigate = useNavigate();
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const saved = slug ? doc.collections[info.name]?.[slug] : undefined;
  const contributor = site.role === "contributor";
  const designer = can(site, "designer");
  const listPath = workspacePath(site.id, "content", info.name);

  const [draft, setDraft] = useState<Draft | null>(() =>
    saved ? draftFrom(saved) : slug ? null : draftFrom(newItem(doc, info.name, info.kind)),
  );
  const [savedKey, setSavedKey] = useState(() => key(saved));
  const [slugTouched, setSlugTouched] = useState(Boolean(saved));
  const [preview, setPreview] = useState<null | "desktop" | "phone">(null);
  const [confirm, setConfirm] = useState<null | "delete" | "leave">(null);
  const [showProblems, setShowProblems] = useState(false);
  const [elsewhere, setElsewhere] = useState(false);

  const current = draft ? itemWithBody(draft) : undefined;
  const dirty = !saved || key(current) !== savedKey;

  // Someone else (a collaborator, the AI, an approval) changed the saved item.
  const lastSaved = useRef(key(saved));
  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts only to the saved item changing elsewhere; the draft is read at that moment
  useEffect(() => {
    const k = key(saved);
    if (k === lastSaved.current) return;
    lastSaved.current = k;
    if (!saved) return;
    if (!dirty || key(current) === k) {
      setDraft(draftFrom(saved));
      setSavedKey(k);
    } else setElsewhere(true);
  }, [saved]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", on);
    return () => window.removeEventListener("beforeunload", on);
  }, [dirty]);

  const problems = useMemo(() => (current ? itemProblems(current) : []), [current]);
  const problemsByField = useMemo(
    () => Object.fromEntries(problems.map((p) => [p.field, p.message])),
    [problems],
  );

  const page: Page | null = useMemo(() => {
    if (!current || !preview) return null;
    try {
      return itemPage({ doc, registry: blocksRegistry() }, info.name, current);
    } catch {
      return null;
    }
  }, [current, preview, doc, info.name]);

  const seo = useMemo(() => {
    if (!current) return [];
    try {
      const p = itemPage({ doc, registry: blocksRegistry() }, info.name, current);
      const withPage = { ...doc, pages: { ...doc.pages, [p.id]: p } } as SiteDocument;
      return sortIssues(seoCheck(p, withPage))
        .filter((i) => i.severity !== "info")
        .slice(0, 4);
    } catch {
      return [];
    }
  }, [current, doc, info.name]);

  if (!draft || !current) {
    return (
      <div className="st-ws-empty">
        <p>This {info.itemLabel.toLowerCase()} isn't here any more. It may have been deleted.</p>
        <Button onClick={() => navigate(listPath)}>Back to {info.label}</Button>
      </div>
    );
  }

  const fm = current.frontmatter;
  const setItem = (item: CollectionItem) => {
    // Keep the address in step with the title until someone edits it.
    if (!slugTouched && !saved && item.frontmatter.title !== fm.title) {
      const s = uniqueItemSlug(doc, info.name, slugify(item.frontmatter.title));
      item = { ...item, slug: s } as CollectionItem;
    }
    setDraft({ ...draft, item });
  };
  const setFm = (patch: Record<string, unknown>) =>
    setItem({
      ...draft.item,
      frontmatter: { ...draft.item.frontmatter, ...patch },
    } as CollectionItem);

  const readOnly = contributor && saved && saved.frontmatter.status !== "draft";

  const save = (status?: CollectionItem["frontmatter"]["status"]) => {
    const next = itemWithBody({
      ...draft,
      item: status
        ? ({ ...draft.item, frontmatter: { ...draft.item.frontmatter, status } } as CollectionItem)
        : draft.item,
    });
    if (next.frontmatter.status !== "scheduled") delete next.frontmatter.publishAt;
    const issues = itemProblems(next);
    if (issues.length) {
      setShowProblems(true);
      return;
    }
    const verb = contributor
      ? "Submitted"
      : next.frontmatter.status === "published"
        ? saved?.frontmatter.status === "published"
          ? "Updated"
          : "Published"
        : next.frontmatter.status === "scheduled"
          ? "Scheduled"
          : "Saved";
    const r = api.getState().commit(saveItemOps(doc, info.name, next, saved?.slug), {
      label: `${verb} “${next.frontmatter.title}”`,
    });
    if (!r.ok) {
      toast({
        tone: "danger",
        title: "Couldn't save",
        description: r.errors[0]?.message ?? "Try again.",
      });
      return;
    }
    lastSaved.current = key(next);
    setSavedKey(key(next));
    setDraft({ ...draft, item: next });
    setElsewhere(false);
    toast({
      tone: "success",
      title: contributor ? "Sent for review" : `${verb}`,
      description: contributor
        ? "An editor will look at it before it goes on your site."
        : next.frontmatter.status === "draft"
          ? "Only people working on the site can see drafts."
          : "It's on your site the next time you publish.",
    });
    if (next.slug !== slug)
      navigate(workspacePath(site.id, "content", info.name, next.slug), { replace: true });
  };

  const remove = () => {
    if (saved) {
      const r = api.getState().commit(deleteItemOps(info.name, saved.slug), {
        label: `Delete “${saved.frontmatter.title}”`,
      });
      if (!r.ok) {
        toast({ tone: "danger", title: "Couldn't delete", description: r.errors[0]?.message });
        return;
      }
    }
    setConfirm(null);
    navigate(listPath);
  };

  const duplicate = () => {
    const copy = duplicateItem(doc, info.name, current);
    const r = api
      .getState()
      .commit(saveItemOps(doc, info.name, copy), { label: `Duplicate “${fm.title}”` });
    if (r.ok) navigate(workspacePath(site.id, "content", info.name, copy.slug));
  };

  const addCategory = (label: string) => {
    const cfg = info.config ?? undefined;
    if (!cfg) return;
    const slugValue = slugify(label);
    const cats = cfg.taxonomies?.categories ?? [];
    if (!cats.some((c) => c.slug === slugValue)) {
      api.getState().commit(
        configOps(info.name, {
          ...cfg,
          taxonomies: { ...cfg.taxonomies, categories: [...cats, { slug: slugValue, label }] },
        }),
        { label: `Add category “${label}”` },
      );
    }
    setFm({ categories: [...new Set([...(fm.categories ?? []), slugValue])] });
  };

  const status = fm.status;
  const primaryLabel = contributor
    ? "Submit for review"
    : status === "published"
      ? saved?.frontmatter.status === "published"
        ? "Update"
        : "Publish"
      : status === "scheduled"
        ? "Schedule"
        : "Save draft";

  const fmProps: FrontmatterProps = {
    item: current,
    onChange: (item) => setItem({ ...item, body: draft.item.body } as CollectionItem),
    doc,
    collection: info.name,
    config: info.config,
    site,
    problems: problemsByField,
    onAddCategory: designer && info.config ? addCategory : undefined,
  };

  return (
    <div className="st-item">
      <div className="st-item__top">
        <button
          type="button"
          className="st-ws-back"
          onClick={() => (dirty && saved ? setConfirm("leave") : navigate(listPath))}
        >
          <ArrowLeft aria-hidden="true" /> {info.label}
        </button>
        <span className="st-item__state" aria-live="polite">
          <StatusBadge item={saved ?? current} />
          {dirty && <span className="st-item__dirty">Unsaved changes</span>}
        </span>
        <span className="st-ws-toolbar__spacer" />
        <Segmented
          size="sm"
          aria-label="Preview"
          value={preview ?? "off"}
          onValueChange={(v) => setPreview(v === "off" ? null : (v as "desktop" | "phone"))}
          options={[
            { value: "off", label: <EyeOff />, ariaLabel: "Hide preview" },
            { value: "desktop", label: <Monitor />, ariaLabel: "Preview on a computer" },
            { value: "phone", label: <Smartphone />, ariaLabel: "Preview on a phone" },
          ]}
        />
        {saved && (
          <Menu
            align="end"
            label="More"
            trigger={<IconButton label="More" icon={<MoreHorizontal />} />}
            items={[
              ...(!contributor
                ? [{ label: "Duplicate", icon: <Copy />, onSelect: duplicate }]
                : []),
              {
                label: draft.raw !== null ? "Edit with blocks" : "Edit as plain text",
                icon: <FileText />,
                onSelect: () =>
                  setDraft(
                    draft.raw !== null
                      ? draftFrom({ ...draft.item, body: draft.raw } as CollectionItem)
                      : { ...draft, raw: blocksToMarkdoc(draft.blocks) },
                  ),
              },
              ...(!readOnly
                ? [
                    { type: "separator" as const },
                    {
                      label: "Delete",
                      icon: <Trash2 />,
                      danger: true,
                      onSelect: () => setConfirm("delete"),
                    },
                  ]
                : []),
            ]}
          />
        )}
        {!contributor && status !== "draft" && (
          <Button variant="ghost" disabled={Boolean(readOnly)} onClick={() => save("draft")}>
            Save as draft
          </Button>
        )}
        <Button
          variant="primary"
          disabled={Boolean(readOnly) || (!dirty && Boolean(saved))}
          onClick={() => save(contributor ? "draft" : undefined)}
        >
          {primaryLabel}
        </Button>
      </div>

      {elsewhere && (
        <div className="st-callout st-callout--pending" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            Someone else changed this {info.itemLabel.toLowerCase()} while you were editing.{" "}
            <button
              type="button"
              className="st-linklike"
              onClick={() => {
                if (saved) setDraft(draftFrom(saved));
                setSavedKey(key(saved));
                setElsewhere(false);
              }}
            >
              Load their version
            </button>{" "}
            or keep yours and save over it.
          </span>
        </div>
      )}
      {readOnly && (
        <div className="st-callout st-callout--accent" role="status">
          <Eye aria-hidden="true" />
          <span>
            This is live on the site. Contributors can suggest new drafts but not change published
            items.
          </span>
        </div>
      )}
      {showProblems && problems.length > 0 && (
        <div className="st-callout st-callout--danger" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>Fix these before saving:</strong>
            <ul className="st-item__problems">
              {problems.map((p) => (
                <li key={`${p.field}-${p.message}`}>
                  {p.field}: {p.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className={preview ? "st-item__layout has-preview" : "st-item__layout"}>
        <div className="st-item__main">
          <textarea
            className="st-item__title"
            aria-label="Title"
            rows={1}
            maxLength={200}
            placeholder={`${info.itemLabel} title`}
            value={fm.title}
            disabled={Boolean(readOnly)}
            onChange={(e) => setFm({ title: e.target.value.replace(/\n/g, " ") })}
          />
          {draft.raw !== null ? (
            <Field
              label="Body (plain text)"
              hint="Markdown, with blocks written as {% tags %}. Switch back to blocks from the ⋯ menu."
            >
              <TextArea
                rows={18}
                className="st-item__raw"
                value={draft.raw}
                onChange={(e) => setDraft({ ...draft, raw: e.target.value })}
              />
            </Field>
          ) : (
            <BodyEditor
              label={`${info.itemLabel} body`}
              blocks={draft.blocks}
              onChange={(blocks) => setDraft({ ...draft, blocks })}
            />
          )}
        </div>

        {preview ? (
          <div className="st-item__preview">
            <PreviewFrame
              doc={doc}
              page={page}
              width={preview === "phone" ? 390 : undefined}
              title={`Preview of ${fm.title}`}
            />
          </div>
        ) : (
          <aside className="st-item__aside" aria-label="Details">
            <section className="st-item__card" aria-labelledby="item-publish">
              <h3 id="item-publish">Publishing</h3>
              {contributor ? (
                <p className="st-ws-hint">
                  You're writing a draft. When you submit it, an editor reviews it before it goes on
                  the site.
                </p>
              ) : (
                <Segmented
                  block
                  aria-label="Status"
                  value={status}
                  onValueChange={(v) =>
                    setFm({
                      status: v,
                      publishAt:
                        v === "scheduled"
                          ? (fm.publishAt ?? localDateTime(Date.now() + 86_400_000))
                          : undefined,
                    })
                  }
                  options={[
                    { value: "draft", label: "Draft" },
                    { value: "scheduled", label: "Scheduled" },
                    { value: "published", label: "Published" },
                  ]}
                />
              )}
              {status === "scheduled" && !contributor && (
                <Field label="Goes live" error={problemsByField["Publish date"]}>
                  <Input
                    type="datetime-local"
                    value={toInputDateTime(fm.publishAt)}
                    onChange={(e) =>
                      setFm({ publishAt: fromInputDateTime(e.target.value) ?? undefined })
                    }
                  />
                </Field>
              )}
              {"date" in fm && (
                <Field label="Date" error={problemsByField.Date}>
                  <Input
                    type="date"
                    value={String(fm.date ?? "")}
                    onChange={(e) => setFm({ date: e.target.value || undefined })}
                  />
                </Field>
              )}
              <Field
                label="Address"
                hint={`${site.url.replace(/\/$/, "")}/${info.name}/${current.slug}`}
                error={problemsByField.Address}
              >
                <Input
                  prefix={<span className="st-item__prefix">/{info.name}/</span>}
                  value={current.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setDraft({
                      ...draft,
                      item: {
                        ...draft.item,
                        slug: slugify(e.target.value) || "",
                      } as CollectionItem,
                    });
                  }}
                />
              </Field>
              {saved && saved.slug !== current.slug && saved.frontmatter.status === "published" && (
                <p className="st-ws-hint">The old address will send visitors to the new one.</p>
              )}
              {saved && effectiveStatus(saved) === "scheduled" && saved.frontmatter.publishAt && (
                <p className="st-ws-hint">Goes live {dateTime(saved.frontmatter.publishAt)}.</p>
              )}
            </section>

            <section className="st-item__card" aria-labelledby="item-details">
              <h3 id="item-details">{DETAIL_TITLE[current.kind]}</h3>
              {FORMS[current.kind](fmProps)}
            </section>

            <section className="st-item__card" aria-labelledby="item-cover">
              <h3 id="item-cover">Image and summary</h3>
              <CoverFields item={current} onChange={fmProps.onChange} />
            </section>

            {(current.kind === "blog" || info.config?.taxonomies) && (
              <section className="st-item__card" aria-labelledby="item-tax">
                <h3 id="item-tax">Categories and tags</h3>
                <TaxonomyFields {...fmProps} />
              </section>
            )}

            <section className="st-item__card" aria-labelledby="item-seo">
              <h3 id="item-seo">Search and sharing</h3>
              <Field label="Search title" hint="Leave empty to use the title.">
                <Input
                  maxLength={120}
                  value={fm.seo?.title ?? ""}
                  placeholder={fm.title}
                  onChange={(e) =>
                    setFm({ seo: cleanSeo({ ...fm.seo, title: e.target.value || undefined }) })
                  }
                />
              </Field>
              <Field label="Search description" hint="Leave empty to use the excerpt.">
                <TextArea
                  rows={2}
                  maxLength={320}
                  value={fm.seo?.description ?? ""}
                  placeholder={fm.excerpt}
                  onChange={(e) =>
                    setFm({
                      seo: cleanSeo({ ...fm.seo, description: e.target.value || undefined }),
                    })
                  }
                />
              </Field>
              {seo.length > 0 ? (
                <ul className="st-item__seo">
                  {seo.map((i) => (
                    <li key={i.id}>
                      <Badge tone={i.severity === "error" ? "danger" : "pending"}>
                        {i.severity === "error" ? "Fix" : "Tip"}
                      </Badge>
                      <span>
                        {i.message} <em>{i.fix}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="st-ws-hint">Looks good for search engines.</p>
              )}
            </section>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete “${fm.title}”?`}
        description={
          saved?.frontmatter.status === "published"
            ? "It comes off your site the next time you publish. You can undo this from the editor."
            : "You can undo this from the editor."
        }
        confirmLabel="Delete"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={confirm === "leave"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Leave without saving?"
        description="Your changes to this item will be lost."
        confirmLabel="Discard changes"
        onConfirm={() => {
          setConfirm(null);
          navigate(listPath);
        }}
      />
    </div>
  );
}

function cleanSeo(seo: Record<string, unknown>) {
  const out = Object.fromEntries(
    Object.entries(seo).filter(([, v]) => v !== undefined && v !== ""),
  );
  return Object.keys(out).length ? out : undefined;
}
