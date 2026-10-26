import type { OpBody } from "@openspace/ops";
import { type CollectionConfig, CollectionConfigSchema } from "@openspace/schema";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Button, Dialog, Field, IconButton, Input, Select, TextArea } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { slugify } from "../pages/pageOps";
import { workspacePath } from "../workspace/routes";
import { ConfirmDialog, SwitchRow } from "../workspace/ui";
import { configOps, slugFromPattern } from "./itemOps";
import { type CollectionInfo, KIND_META } from "./kinds";

const LAYOUTS: Array<{ value: CollectionConfig["list"]["layout"]; label: string }> = [
  { value: "cards", label: "Cards" },
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
  { value: "masonry", label: "Masonry" },
  { value: "calendar", label: "Calendar" },
  { value: "compact", label: "Compact list" },
];
const SORTS: Array<{ value: CollectionConfig["list"]["sort"]; label: string }> = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest (or soonest) first" },
  { value: "title", label: "A to Z" },
  { value: "manual", label: "In the order you set" },
];
const ITEM_LAYOUTS: Array<{
  value: NonNullable<CollectionConfig["itemPage"]>["layout"];
  label: string;
}> = [
  { value: "article", label: "Article (narrow, easy to read)" },
  { value: "wide", label: "Wide" },
  { value: "split", label: "Split (photo beside details)" },
  { value: "gallery", label: "Gallery" },
  { value: "minimal", label: "Minimal" },
];
const PATTERNS = [
  { value: "{title}", label: "Title only — /opening-day" },
  { value: "{date}-{title}", label: "Date and title — /2026-10-26-opening-day" },
  { value: "{year}-{title}", label: "Year and title — /2026-opening-day" },
];
const FEED_FORMAT: Record<string, NonNullable<CollectionConfig["feed"]>["format"]> = {
  blog: "rss",
  events: "ical",
  podcast: "podcast",
  portfolio: "rss",
  products: "rss",
};

/** `_collection.json`: names, list and item page layouts, address pattern, categories, feed. */
export function CollectionSettingsDialog({
  site,
  info,
  open,
  onOpenChange,
}: {
  site: Site;
  info: CollectionInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useDocStoreApi();
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const [cfg, setCfg] = useState<CollectionConfig>(
    () => structuredClone(info.config) ?? KIND_META[info.kind].config(),
  );
  const [error, setError] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const [deleting, setDeleting] = useState(false);
  const cats = cfg.taxonomies?.categories ?? [];
  const setCats = (categories: Array<{ slug: string; label: string }>) =>
    setCfg({ ...cfg, taxonomies: { ...cfg.taxonomies, categories } });

  const save = () => {
    const clean: CollectionConfig = structuredClone(cfg);
    if (clean.slugPattern === "{title}") delete clean.slugPattern;
    const parsed = CollectionConfigSchema.safeParse(clean);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the settings.");
      return;
    }
    const r = api.getState().commit(configOps(info.name, parsed.data), {
      label: `Update ${info.label} settings`,
    });
    if (!r.ok) {
      setError(r.errors[0]?.message ?? "Couldn't save.");
      return;
    }
    onOpenChange(false);
  };

  const removeCollection = () => {
    const bodies: OpBody[] = Object.keys(doc.collections[info.name] ?? {}).map(
      (slug) => ({ op: "collection.delete", collection: info.name, slug }) as OpBody,
    );
    if (doc.collectionConfigs?.[info.name]) bodies.push(...configOps(info.name, null));
    api.getState().commit(bodies, { label: `Delete ${info.label}` });
    setDeleting(false);
    onOpenChange(false);
    navigate(workspacePath(site.id, "content"));
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={`${info.label} settings`}
        width={560}
        footer={
          <>
            <Button variant="ghost" className="st-dialog-left" onClick={() => setDeleting(true)}>
              Delete collection
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="st-form">
          <fieldset className="st-fieldset">
            <legend>Names</legend>
            <div className="st-ws-cols">
              <Field label="Collection name">
                <Input
                  value={cfg.label}
                  maxLength={60}
                  onChange={(e) => setCfg({ ...cfg, label: e.target.value })}
                />
              </Field>
              <Field label="One item is called">
                <Input
                  value={cfg.itemLabel ?? ""}
                  maxLength={60}
                  placeholder={KIND_META[info.kind].itemLabel}
                  onChange={(e) => setCfg({ ...cfg, itemLabel: e.target.value || undefined })}
                />
              </Field>
            </div>
          </fieldset>
          <fieldset className="st-fieldset">
            <legend>List page</legend>
            <div className="st-ws-cols st-ws-cols--3">
              <Field label="Layout">
                <Select
                  value={cfg.list.layout}
                  onValueChange={(layout) => setCfg({ ...cfg, list: { ...cfg.list, layout } })}
                  options={LAYOUTS}
                />
              </Field>
              <Field label="Order">
                <Select
                  value={cfg.list.sort}
                  onValueChange={(sort) => setCfg({ ...cfg, list: { ...cfg.list, sort } })}
                  options={SORTS}
                />
              </Field>
              <Field label="Per page">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={cfg.list.pageSize}
                  onChange={(e) =>
                    setCfg({
                      ...cfg,
                      list: {
                        ...cfg.list,
                        pageSize: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </Field>
            </div>
          </fieldset>
          <fieldset className="st-fieldset">
            <legend>Item page</legend>
            <Field label="Layout">
              <Select
                value={cfg.itemPage?.layout ?? "article"}
                onValueChange={(layout) =>
                  setCfg({ ...cfg, itemPage: { ...cfg.itemPage, layout } })
                }
                options={ITEM_LAYOUTS}
              />
            </Field>
            {(
              [
                ["showDate", "Show the date"],
                ...(info.kind === "blog" ? [["showAuthor", "Show the author"] as const] : []),
                ["showRelated", "Show related items at the end"],
              ] as const
            ).map(([k, label]) => (
              <SwitchRow
                key={k}
                label={label}
                checked={cfg.itemPage?.[k] !== false}
                onCheckedChange={(v) =>
                  setCfg({
                    ...cfg,
                    itemPage: {
                      layout: cfg.itemPage?.layout ?? "article",
                      ...cfg.itemPage,
                      [k]: v,
                    },
                  })
                }
              />
            ))}
            <Field
              label="Addresses for new items"
              hint={`Example: /${info.name}/${slugFromPattern(cfg.slugPattern, "Opening day", "2026-10-26")}`}
            >
              <Select
                value={cfg.slugPattern ?? "{title}"}
                onValueChange={(slugPattern) => setCfg({ ...cfg, slugPattern })}
                options={PATTERNS}
              />
            </Field>
          </fieldset>
          <fieldset className="st-fieldset">
            <legend>Categories and tags</legend>
            {cats.map((c, i) => (
              <div key={c.slug} className="st-inline-form">
                <Input
                  aria-label={`Category ${i + 1}`}
                  value={c.label}
                  onChange={(e) =>
                    setCats(cats.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                />
                <IconButton
                  size="sm"
                  label={`Remove ${c.label}`}
                  icon={<Trash2 />}
                  onClick={() => setCats(cats.filter((_, j) => j !== i))}
                />
              </div>
            ))}
            <form
              className="st-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const slug = slugify(newCat);
                if (newCat.trim() && !cats.some((c) => c.slug === slug))
                  setCats([...cats, { slug, label: newCat.trim() }]);
                setNewCat("");
              }}
            >
              <Input
                aria-label="New category"
                placeholder="New category"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <Button size="sm" type="submit" icon={<Plus />} disabled={!newCat.trim()}>
                Add
              </Button>
            </form>
            <SwitchRow
              label={<>Use tags</>}
              checked={cfg.taxonomies?.tags !== false}
              onCheckedChange={(tags) =>
                setCfg({ ...cfg, taxonomies: { ...cfg.taxonomies, tags } })
              }
            />
          </fieldset>
          <fieldset className="st-fieldset">
            <legend>Feed</legend>
            <SwitchRow
              label={
                info.kind === "podcast"
                  ? "Podcast feed for Apple and Spotify"
                  : info.kind === "events"
                    ? "Calendar feed people can subscribe to"
                    : "RSS feed for readers"
              }
              checked={Boolean(cfg.feed?.enabled)}
              onCheckedChange={(enabled) =>
                setCfg({
                  ...cfg,
                  feed: {
                    ...cfg.feed,
                    enabled,
                    format: cfg.feed?.format ?? FEED_FORMAT[info.kind],
                  },
                })
              }
            />
            {cfg.feed?.enabled && (
              <>
                <Field label="Feed title" hint={`Defaults to ${cfg.label}`}>
                  <Input
                    maxLength={120}
                    value={cfg.feed.title ?? ""}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        feed: { ...cfg.feed, enabled: true, title: e.target.value || undefined },
                      })
                    }
                  />
                </Field>
                <Field label="Feed description">
                  <TextArea
                    rows={2}
                    maxLength={500}
                    value={cfg.feed.description ?? ""}
                    onChange={(e) =>
                      setCfg({
                        ...cfg,
                        feed: {
                          ...cfg.feed,
                          enabled: true,
                          description: e.target.value || undefined,
                        },
                      })
                    }
                  />
                </Field>
              </>
            )}
          </fieldset>
          {error && (
            <p className="st-ws-hint" role="alert">
              {error}
            </p>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${info.label} and its ${info.count} items?`}
        description="Everything in it comes off your site the next time you publish. You can undo this from the editor."
        confirmLabel={`Delete ${info.label}`}
        onConfirm={removeCollection}
      />
    </>
  );
}
