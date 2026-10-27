import type { CollectionItem } from "@omniharmonic/openspace-schema";
import { CalendarDays, Copy, MoreHorizontal, Plus, Repeat, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Button, EmptyState, IconButton, Menu, Segmented, Select, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useMediaPreviewUrl } from "../media/sources";
import { can } from "../site-mgmt/manage-ui";
import { date, dateTime, money } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { ConfirmDialog, SearchField, useDebounced, WsHeader } from "../workspace/ui";
import { CollectionSettingsDialog } from "./CollectionSettingsDialog";
import {
  deleteItemOps,
  duplicateItem,
  filterItems,
  type ItemFilter,
  type StatusFilter,
  saveItemOps,
} from "./itemOps";
import { type CollectionInfo, KIND_META } from "./kinds";
import { describeRepeat, parseRRule } from "./rrule";
import { StatusBadge } from "./StatusBadge";

const EMPTY_TEACH: Record<CollectionItem["kind"], { title: string; body: string }> = {
  blog: {
    title: "Write your first post",
    body: "Posts appear newest first on your blog page, in your RSS feed, and anywhere you add a “Summary” section.",
  },
  events: {
    title: "Add your first event",
    body: "Give it a date, a place and a sign-up link. Past events move out of the way on their own.",
  },
  portfolio: {
    title: "Add your first project",
    body: "A few photos and a sentence about the work is plenty. Projects show up as a gallery on your site.",
  },
  podcast: {
    title: "Add your first episode",
    body: "Upload the audio or paste a link from your podcast host. Your podcast feed for Apple and Spotify updates itself.",
  },
  products: {
    title: "Add your first product",
    body: "Add a price and photos. Sizes or colors become variants you can price and stock separately.",
  },
};

function Thumb({ src }: { src?: string }) {
  const url = useMediaPreviewUrl(src);
  return url ? (
    <img className="st-ws-thumb" src={url} alt="" />
  ) : (
    <span className="st-ws-thumb st-ws-thumb--empty" aria-hidden="true" />
  );
}

function meta(item: CollectionItem): string {
  switch (item.kind) {
    case "blog":
      return [date(item.frontmatter.date), item.frontmatter.author].filter(Boolean).join(" · ");
    case "events": {
      const fm = item.frontmatter;
      const when =
        /^\d{4}-\d{2}-\d{2}$/.test(fm.start) || fm.allDay ? date(fm.start) : dateTime(fm.start);
      const rule = fm.recurrence ? parseRRule(fm.recurrence, fm.start) : null;
      return [
        when,
        rule ? describeRepeat(rule, fm.start) : null,
        fm.location?.name ?? (fm.location?.online ? "Online" : null),
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "portfolio":
      return [item.frontmatter.client, item.frontmatter.year].filter(Boolean).join(" · ");
    case "podcast": {
      const fm = item.frontmatter;
      const ep = [
        fm.season ? `Season ${fm.season}` : null,
        fm.episode !== undefined ? `Episode ${fm.episode}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return [ep, date(fm.date)].filter(Boolean).join(" · ");
    }
    case "products": {
      const fm = item.frontmatter;
      const n = fm.variants?.length;
      return [
        money(fm.price.amount, fm.price.currency),
        n ? `${n} variants` : null,
        fm.digital ? "Digital" : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

/** One collection: its items with search, status filters and quick actions. */
export function CollectionList({ site, info }: { site: Site; info: CollectionInfo }) {
  const navigate = useNavigate();
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<string>("");
  const [when, setWhen] = useState<"all" | "upcoming" | "past">("upcoming");
  const [settings, setSettings] = useState(false);
  const [deleting, setDeleting] = useState<CollectionItem | null>(null);
  const query = useDebounced(q, 150);
  const items = useMemo(() => Object.values(doc.collections[info.name] ?? {}), [doc, info.name]);
  const filter: ItemFilter = {
    q: query,
    status,
    category: category || undefined,
    when: info.kind === "events" ? when : "all",
  };
  const shown = filterItems(
    items,
    filter,
    info.kind === "events" ? "date-asc" : info.config?.list.sort,
  );
  const counts = useMemo(() => {
    const c = { all: items.length, published: 0, scheduled: 0, draft: 0 };
    for (const i of items) c[i.frontmatter.status]++;
    return c;
  }, [items]);
  const open = (slug: string) => navigate(workspacePath(site.id, "content", info.name, slug));
  const newPath = workspacePath(site.id, "content", info.name, "new");
  const designer = can(site, "designer");
  const contributor = site.role === "contributor";
  const cats = info.config?.taxonomies?.categories ?? [];
  const itemWord = info.itemLabel.toLowerCase();

  const duplicate = (item: CollectionItem) => {
    const copy = duplicateItem(doc, info.name, item);
    const r = api.getState().commit(saveItemOps(doc, info.name, copy), {
      label: `Duplicate “${item.frontmatter.title}”`,
    });
    if (r.ok) toast({ tone: "success", title: "Duplicated", description: copy.frontmatter.title });
  };

  return (
    <div className="st-ws-stack">
      <WsHeader
        title={info.label}
        description={KIND_META[info.kind].description}
        actions={
          <>
            {designer && (
              <IconButton
                label={`${info.label} settings`}
                icon={<Settings2 />}
                onClick={() => setSettings(true)}
              />
            )}
            <Button variant="primary" icon={<Plus />} onClick={() => navigate(newPath)}>
              New {itemWord}
            </Button>
          </>
        }
      />

      {items.length > 0 && (
        <div className="st-ws-toolbar">
          <SearchField value={q} onChange={setQ} label={`Search ${info.label.toLowerCase()}`} />
          <Segmented<StatusFilter>
            size="sm"
            aria-label="Show"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: `All ${counts.all}` },
              { value: "published", label: `Published ${counts.published}` },
              { value: "scheduled", label: `Scheduled ${counts.scheduled}` },
              { value: "draft", label: `Drafts ${counts.draft}` },
            ]}
          />
          {info.kind === "events" && (
            <Segmented
              size="sm"
              aria-label="When"
              value={when}
              onValueChange={setWhen}
              options={[
                { value: "upcoming", label: "Upcoming" },
                { value: "past", label: "Past" },
                { value: "all", label: "All dates" },
              ]}
            />
          )}
          {cats.length > 0 && (
            <Select
              aria-label="Filter by category"
              size="sm"
              value={category || "__all"}
              onValueChange={(v) => setCategory(v === "__all" ? "" : v)}
              options={[
                { value: "__all", label: "All categories" },
                ...cats.map((c) => ({ value: c.slug, label: c.label })),
              ]}
            />
          )}
        </div>
      )}

      <div className="st-ws-panel">
        {items.length === 0 ? (
          <EmptyState
            className="st-ws-empty"
            icon={<CalendarDays />}
            title={EMPTY_TEACH[info.kind].title}
            description={EMPTY_TEACH[info.kind].body}
            action={
              <Button variant="primary" icon={<Plus />} onClick={() => navigate(newPath)}>
                New {itemWord}
              </Button>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            className="st-ws-empty"
            size="sm"
            title={`No ${info.label.toLowerCase()} match`}
            description="Try a different word, or show everything."
            action={
              <Button
                onClick={() => {
                  setQ("");
                  setStatus("all");
                  setCategory("");
                  setWhen("all");
                }}
              >
                Show everything
              </Button>
            }
          />
        ) : (
          <ul className="st-ws-list" aria-label={info.label}>
            {shown.map((item) => {
              const fm = item.frontmatter;
              const image =
                fm.image ??
                (item.kind === "products" ? item.frontmatter.images?.[0]?.src : undefined) ??
                (item.kind === "portfolio" ? item.frontmatter.gallery?.[0]?.src : undefined);
              const canChange = !contributor || fm.status === "draft";
              return (
                <li key={item.slug} className="st-coll-row">
                  <button
                    type="button"
                    className="st-ws-row st-ws-row--media"
                    onClick={() => open(item.slug)}
                  >
                    <Thumb src={image} />
                    <span className="st-ws-row__main">
                      <span className="st-ws-row__title">{fm.title}</span>
                      <span className="st-ws-row__meta">
                        {item.kind === "events" && item.frontmatter.recurrence && (
                          <Repeat aria-label="Repeats" className="st-inline-icon" />
                        )}
                        {meta(item)}
                      </span>
                    </span>
                    <span className="st-ws-row__side">
                      <StatusBadge item={item} />
                    </span>
                  </button>
                  <Menu
                    align="end"
                    label={`${fm.title} options`}
                    trigger={
                      <IconButton
                        className="st-coll-row__menu"
                        size="sm"
                        label={`${fm.title} options`}
                        icon={<MoreHorizontal />}
                      />
                    }
                    items={[
                      { label: "Edit", onSelect: () => open(item.slug) },
                      ...(!contributor
                        ? [{ label: "Duplicate", icon: <Copy />, onSelect: () => duplicate(item) }]
                        : []),
                      ...(canChange
                        ? [
                            { type: "separator" as const },
                            {
                              label: "Delete",
                              icon: <Trash2 />,
                              danger: true,
                              onSelect: () => setDeleting(item),
                            },
                          ]
                        : []),
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {settings && (
        <CollectionSettingsDialog
          site={site}
          info={info}
          open={settings}
          onOpenChange={setSettings}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.frontmatter.title ?? ""}”?`}
        description="It comes off your site the next time you publish. You can undo this from the editor."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleting) {
            api.getState().commit(deleteItemOps(info.name, deleting.slug), {
              label: `Delete “${deleting.frontmatter.title}”`,
            });
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
