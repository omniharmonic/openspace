import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { NavItem, Page, SiteDocument } from "@openspace/schema";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  EyeOff,
  FileText,
  Folder,
  FolderInput,
  FolderOutput,
  GripVertical,
  House,
  Library,
  Link2,
  Lock,
  MoreHorizontal,
  MousePointerClick,
  Plus,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import {
  Button,
  cx,
  Dialog,
  Field,
  IconButton,
  Input,
  Menu,
  type MenuEntry,
  toast,
} from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useManageUi } from "../site-mgmt/manage-ui";
import {
  buildNav,
  flattenNav,
  isLeaf,
  moveRow,
  type Nav,
  type NavRow,
  nudgeRow,
  pagesInNav,
  projectMove,
  removeRow,
  setFolder,
  updateItem,
  withPage,
} from "./navTree";
import { deletePage, duplicatePage, setNav } from "./pageOps";
import "./pages.css";

const INDENT = 18;

function pageOf(doc: SiteDocument, id: string | undefined): Page | undefined {
  return id ? doc.pages[id as keyof SiteDocument["pages"]] : undefined;
}

function rowLabel(doc: SiteDocument, item: NavItem): string {
  if (item.type === "page") return item.label ?? pageOf(doc, item.page)?.title ?? "Missing page";
  return item.label;
}

function rowPath(doc: SiteDocument, item: NavItem): string {
  if (item.type === "page") {
    const p = pageOf(doc, item.page);
    return p ? `/${p.slug}` : "";
  }
  if (item.type === "collection") return `/${item.collection}`;
  if (item.type === "link") {
    try {
      return new URL(item.href).hostname.replace(/^www\./, "");
    } catch {
      return item.href;
    }
  }
  if (item.type === "button") return "Button";
  return `${item.items.length} item${item.items.length === 1 ? "" : "s"}`;
}

function RowIcon({ doc, item }: { doc: SiteDocument; item: NavItem }) {
  if (item.type === "folder") return <Folder aria-hidden="true" />;
  if (item.type === "link") return <Link2 aria-hidden="true" />;
  if (item.type === "collection") return <Library aria-hidden="true" />;
  if (item.type === "button") return <MousePointerClick aria-hidden="true" />;
  return pageOf(doc, item.page)?.slug === "" ? (
    <House aria-hidden="true" />
  ) : (
    <FileText aria-hidden="true" />
  );
}

function PageBadges({ page, hiddenInNav }: { page?: Page; hiddenInNav?: boolean }) {
  return (
    <span className="st-pm__badges">
      {page?.access?.password && <Lock aria-label="Password protected" />}
      {page?.access?.members && <Users aria-label="Members only" />}
      {(hiddenInNav || page?.hidden) && (
        <EyeOff aria-label={page?.hidden ? "Unlisted" : "Hidden from navigation"} />
      )}
    </span>
  );
}

interface RowProps {
  row: NavRow;
  doc: SiteDocument;
  currentPage: string;
  depthPreview: number | null;
  folders: Array<{ index: number; label: string }>;
  onCommand: (label: string, tree: Nav) => void;
  onOpen: (pageId: string) => void;
  onRename: (row: NavRow) => void;
}

function SortableRow({
  row,
  doc,
  currentPage,
  depthPreview,
  folders,
  onCommand,
  onOpen,
  onRename,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const nav = doc.site.nav;
  const item = row.item;
  const page = item.type === "page" ? pageOf(doc, item.page) : undefined;
  const depth = depthPreview ?? row.depth;
  const current = page && page.id === currentPage;
  const { openPageSettings } = useManageUi.getState();

  const menu: MenuEntry[] = [
    ...(page
      ? [
          {
            label: "Page settings",
            icon: <Settings2 />,
            onSelect: () => openPageSettings(page.id),
          },
          {
            label: "Duplicate",
            icon: <Copy />,
            onSelect: () => onCommand("duplicate", nav),
          },
        ]
      : [{ label: "Rename", icon: <Settings2 />, onSelect: () => onRename(row) }]),
    { type: "separator" as const },
    {
      label: item.hidden ? "Show in navigation" : "Hide from navigation",
      icon: <EyeOff />,
      onSelect: () =>
        onCommand(
          item.hidden ? "Show in navigation" : "Hide from navigation",
          updateItem(nav, row.id, (it) => {
            const { hidden: _h, ...rest } = it as NavItem & { hidden?: boolean };
            return (it.hidden ? rest : { ...it, hidden: true }) as NavItem;
          }),
        ),
    },
    {
      label: "Move up",
      icon: <ArrowUp />,
      onSelect: () => onCommand("Move up", nudgeRow(nav, row.id, -1)),
    },
    {
      label: "Move down",
      icon: <ArrowDown />,
      onSelect: () => onCommand("Move down", nudgeRow(nav, row.id, 1)),
    },
    ...(isLeaf(item) && row.depth === 0
      ? folders.map((f) => ({
          label: `Move into ${f.label}`,
          icon: <FolderInput />,
          onSelect: () => onCommand(`Move into ${f.label}`, setFolder(nav, row.id, f.index)),
        }))
      : []),
    ...(row.depth === 1
      ? [
          {
            label: "Move out of folder",
            icon: <FolderOutput />,
            onSelect: () => onCommand("Move out of folder", setFolder(nav, row.id, null)),
          },
        ]
      : []),
    { type: "separator" as const },
    ...(page
      ? [
          {
            label: "Remove from navigation",
            onSelect: () => onCommand("Remove from navigation", removeRow(nav, row.id)),
          },
          ...(page.slug !== ""
            ? [
                {
                  label: "Delete page",
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: () => onCommand("delete", nav),
                },
              ]
            : []),
        ]
      : [
          {
            label: item.type === "folder" ? "Delete folder (keeps its pages)" : "Delete",
            icon: <Trash2 />,
            danger: true,
            onSelect: () => onCommand("Remove from navigation", removeRow(nav, row.id)),
          },
        ]),
  ];

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onCommand("Reorder navigation", nudgeRow(nav, row.id, e.key === "ArrowUp" ? -1 : 1));
    }
  };

  return (
    <li
      ref={setNodeRef}
      className={cx(
        "st-pm__row",
        isDragging && "is-dragging",
        current && "is-current",
        item.hidden && "is-hidden",
      )}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingInlineStart: 4 + depth * INDENT,
      }}
      data-depth={depth}
    >
      <button
        type="button"
        className="st-pm__grip"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical aria-hidden="true" />
      </button>
      <button
        type="button"
        className="st-pm__main"
        aria-current={current ? "page" : undefined}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (page) onOpen(page.id);
          else if (item.type === "folder" && item.page) onOpen(item.page);
          else onRename(row);
        }}
        onDoubleClick={() => (page ? openPageSettings(page.id) : onRename(row))}
      >
        <RowIcon doc={doc} item={item} />
        <span className="st-pm__title">{rowLabel(doc, item)}</span>
        <span className="st-pm__path">{rowPath(doc, item)}</span>
        <PageBadges page={page} hiddenInNav={item.hidden} />
      </button>
      {page && (
        <IconButton
          className="st-pm__action"
          label="Page settings"
          icon={<Settings2 />}
          size="sm"
          onClick={() => openPageSettings(page.id)}
        />
      )}
      <Menu
        align="end"
        label={`${rowLabel(doc, item)} options`}
        trigger={
          <IconButton
            className="st-pm__action"
            label="More options"
            icon={<MoreHorizontal />}
            size="sm"
            tooltip={false}
          />
        }
        items={menu}
      />
    </li>
  );
}

function LinkDialog({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: { kind: "folder" | "link"; label: string; href?: string } | null;
  onSave: (v: { label: string; href?: string }) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [href, setHref] = useState(initial?.href ?? "https://");
  const isLink = initial?.kind === "link";
  let hrefOk = true;
  try {
    hrefOk = !isLink || /^https?:$/.test(new URL(href).protocol);
  } catch {
    hrefOk = false;
  }
  const ok = label.trim().length > 0 && label.trim().length <= 60 && hrefOk;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={
        isLink
          ? initial?.label
            ? "Edit link"
            : "Add a link"
          : initial?.label
            ? "Rename folder"
            : "Add a folder"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              onSave({ label: label.trim(), ...(isLink ? { href: href.trim() } : {}) });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        className="st-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) {
            onSave({ label: label.trim(), ...(isLink ? { href: href.trim() } : {}) });
            onClose();
          }
        }}
      >
        <Field
          label="Label"
          hint={
            isLink
              ? "What visitors see in the menu."
              : "Pages you put in the folder appear under this name."
          }
        >
          <Input
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
            data-autofocus
          />
        </Field>
        {isLink && (
          <Field
            label="Web address"
            error={
              !hrefOk && href !== "https://"
                ? "Enter a full address starting with https://"
                : undefined
            }
          >
            <Input value={href} inputMode="url" onChange={(e) => setHref(e.target.value)} />
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/**
 * Pages & navigation manager (left panel): the navigation tree with drag-to-reorder, folders,
 * links and hidden entries, then pages that aren't in the navigation. Every change is a
 * `nav.update` / `page.*` op.
 */
export function PagesManager() {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const current = useDocStore((s) => s.pageId);
  const rows = useMemo(() => flattenNav(doc.site.nav), [doc.site.nav]);
  const inNav = pagesInNav(doc.site.nav);
  const others = Object.values(doc.pages)
    .filter((p) => !inNav.has(p.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  const folders = rows
    .filter((r) => r.item.type === "folder")
    .map((r) => ({ index: Number(r.id), label: r.item.type === "folder" ? r.item.label : "" }));
  const [drag, setDrag] = useState<{ id: string; over: string; depth: number } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{
    kind: "folder" | "link";
    rowId?: string;
    label: string;
    href?: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Page | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (
    label: string,
    bodies: Parameters<ReturnType<typeof api.getState>["commit"]>[0],
  ) => {
    const res = api.getState().commit(bodies, { label });
    if (!res.ok)
      toast({
        tone: "danger",
        title: "That change didn’t work",
        description: res.errors[0]?.message,
      });
    return res.ok;
  };

  const onCommand = (row: NavRow) => (label: string, tree: Nav) => {
    const s = api.getState();
    if (label === "duplicate" && row.item.type === "page") {
      const cmd = duplicatePage(s.doc, row.item.page);
      if (cmd && commit(cmd.label, cmd.bodies)) {
        s.setPage(cmd.pageId);
        toast({
          title: "Page duplicated",
          description: cmd.droppedPassword
            ? "The copy is public. Set its own password in Page settings to protect it."
            : "Undo with ⌘Z.",
        });
      }
      return;
    }
    if (label === "delete" && row.item.type === "page") {
      const page = pageOf(s.doc, row.item.page);
      if (page) setConfirmDelete(page);
      return;
    }
    const cmd = setNav(tree, label);
    commit(cmd.label, cmd.bodies);
  };

  const onDragMove = (e: DragMoveEvent) => {
    if (!e.over) return;
    const active = rows.find((r) => r.id === e.active.id);
    const desired = (active?.depth ?? 0) + e.delta.x / INDENT;
    const proj = projectMove(rows, String(e.active.id), String(e.over.id), desired);
    setDrag({ id: String(e.active.id), over: String(e.over.id), depth: proj.depth });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const state = drag;
    setDrag(null);
    if (!e.over || !state) return;
    const overId = String(e.over.id);
    const active = rows.find((r) => r.id === state.id);
    if (!active) return;
    const { depth } = projectMove(rows, state.id, overId, state.depth);
    if (overId === state.id && depth === active.depth) return;
    const tree =
      overId === state.id
        ? buildNav(rows.map((r) => (r.id === state.id ? { ...r, depth } : r)))
        : moveRow(rows, state.id, overId, depth);
    commit("Reorder navigation", setNav(tree).bodies);
  };

  return (
    <div className="st-pm">
      <div className="st-pm__head">
        <h3 className="st-pm__group">Navigation</h3>
        <Menu
          align="end"
          label="Add to navigation"
          trigger={<IconButton label="Add" icon={<Plus />} size="sm" tooltip={false} />}
          items={[
            {
              label: "Page…",
              icon: <FileText />,
              onSelect: () => useManageUi.getState().openAddPage({}),
            },
            {
              label: "Folder…",
              icon: <Folder />,
              onSelect: () => setLinkDialog({ kind: "folder", label: "" }),
            },
            {
              label: "Link…",
              icon: <Link2 />,
              onSelect: () => setLinkDialog({ kind: "link", label: "" }),
            },
          ]}
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => {
          const r = rows.find((x) => x.id === e.active.id);
          setDrag({ id: String(e.active.id), over: String(e.active.id), depth: r?.depth ?? 0 });
        }}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ul className="st-pm__list" aria-label="Navigation">
            {rows.map((row) => (
              <SortableRow
                key={row.id}
                row={row}
                doc={doc}
                currentPage={current}
                depthPreview={drag?.id === row.id ? drag.depth : null}
                folders={folders}
                onCommand={onCommand(row)}
                onOpen={(id) => api.getState().setPage(id)}
                onRename={(r) => {
                  if (r.item.type === "folder" || r.item.type === "link")
                    setLinkDialog({
                      kind: r.item.type,
                      rowId: r.id,
                      label: r.item.label,
                      ...(r.item.type === "link" ? { href: r.item.href } : {}),
                    });
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {rows.length === 0 && (
        <p className="st-pm__empty">Your menu is empty. Add pages to it from below.</p>
      )}

      <div className="st-pm__head">
        <h3 className="st-pm__group">Not in navigation</h3>
      </div>
      {others.length === 0 ? (
        <p className="st-pm__empty">Every page is in your menu.</p>
      ) : (
        <ul className="st-pm__list" aria-label="Pages not in navigation">
          {others.map((p) => (
            <li key={p.id} className={cx("st-pm__row", p.id === current && "is-current")}>
              <span className="st-pm__grip" aria-hidden="true" />
              <button
                type="button"
                className="st-pm__main"
                aria-current={p.id === current ? "page" : undefined}
                onClick={() => api.getState().setPage(p.id)}
                onDoubleClick={() => useManageUi.getState().openPageSettings(p.id)}
              >
                {p.slug === "" ? <House aria-hidden="true" /> : <FileText aria-hidden="true" />}
                <span className="st-pm__title">{p.title}</span>
                <span className="st-pm__path">/{p.slug}</span>
                <PageBadges page={p} />
              </button>
              <IconButton
                className="st-pm__action"
                label="Page settings"
                icon={<Settings2 />}
                size="sm"
                onClick={() => useManageUi.getState().openPageSettings(p.id)}
              />
              <Menu
                align="end"
                label={`${p.title} options`}
                trigger={
                  <IconButton
                    className="st-pm__action"
                    label="More options"
                    icon={<MoreHorizontal />}
                    size="sm"
                    tooltip={false}
                  />
                }
                items={[
                  {
                    label: "Add to navigation",
                    icon: <Plus />,
                    disabled: Boolean(p.hidden),
                    onSelect: () =>
                      commit("Add to navigation", setNav(withPage(doc.site.nav, p.id)).bodies),
                  },
                  {
                    label: "Page settings",
                    icon: <Settings2 />,
                    onSelect: () => useManageUi.getState().openPageSettings(p.id),
                  },
                  {
                    label: "Duplicate",
                    icon: <Copy />,
                    onSelect: () => {
                      const cmd = duplicatePage(api.getState().doc, p.id);
                      if (cmd && commit(cmd.label, cmd.bodies)) {
                        api.getState().setPage(cmd.pageId);
                        if (cmd.droppedPassword)
                          toast({
                            title: "Page duplicated",
                            description:
                              "The copy is public. Set its own password in Page settings to protect it.",
                          });
                      }
                    },
                  },
                  ...(p.slug !== ""
                    ? [
                        { type: "separator" as const },
                        {
                          label: "Delete page",
                          icon: <Trash2 />,
                          danger: true,
                          onSelect: () => setConfirmDelete(p),
                        },
                      ]
                    : []),
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="st-pm__foot">
        <Button
          size="sm"
          icon={<Plus />}
          block
          onClick={() => useManageUi.getState().openAddPage({})}
        >
          Add page
        </Button>
      </div>

      {linkDialog && (
        <LinkDialog
          open
          initial={linkDialog}
          onClose={() => setLinkDialog(null)}
          onSave={({ label, href }) => {
            const nav = api.getState().doc.site.nav;
            if (linkDialog.rowId) {
              commit(
                linkDialog.kind === "folder" ? "Rename folder" : "Edit link",
                setNav(
                  updateItem(nav, linkDialog.rowId, (it) =>
                    it.type === "link"
                      ? { ...it, label, href: href ?? it.href }
                      : ({ ...it, label } as NavItem),
                  ),
                ).bodies,
              );
            } else {
              const item: NavItem =
                linkDialog.kind === "folder"
                  ? { type: "folder", label, items: [] }
                  : { type: "link", label, href: href ?? "", newTab: true };
              commit(
                linkDialog.kind === "folder" ? "Add folder" : "Add link",
                setNav([...nav, item]).bodies,
              );
            }
          }}
        />
      )}
      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.title ?? ""}”?`}
        description="The page and its sections are removed from your site the next time you publish. Undo with ⌘Z, or restore it later from History."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep page
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const s = api.getState();
                const page = confirmDelete;
                setConfirmDelete(null);
                if (!page) return;
                const cmd = deletePage(s.doc, page.id);
                if (!cmd) return;
                if (s.pageId === page.id) {
                  const home = Object.values(s.doc.pages).find((p) => p.slug === "");
                  if (home) s.setPage(home.id);
                }
                if (commit(cmd.label, cmd.bodies))
                  toast({ title: "Page deleted", description: "Undo with ⌘Z." });
              }}
            >
              Delete page
            </Button>
          </>
        }
      />
    </div>
  );
}
