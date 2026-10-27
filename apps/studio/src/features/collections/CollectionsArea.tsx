import type { CollectionKind } from "@omniharmonic/openspace-schema";
import { CalendarDays, FolderKanban, Mic, Newspaper, Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Field, Input } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { can } from "../site-mgmt/manage-ui";
import { workspacePath } from "../workspace/routes";
import { WsHeader } from "../workspace/ui";
import type { AreaProps } from "../workspace/WorkspaceView";
import { CollectionList } from "./CollectionList";
import { ItemEditor } from "./ItemEditor";
import { configOps, uniqueCollectionName } from "./itemOps";
import { collectionInfo, KIND_META, listCollections } from "./kinds";
import "./collections.css";

const ICONS: Record<CollectionKind, React.ReactNode> = {
  blog: <Newspaper />,
  events: <CalendarDays />,
  portfolio: <FolderKanban />,
  podcast: <Mic />,
  products: <Package />,
};

/** `/content`, `/content/new`, `/content/:collection`, `/content/:collection/:slug|new`. */
export function CollectionsArea({ site, route }: AreaProps) {
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const collections = useMemo(() => listCollections(doc), [doc]);
  const [name, item] = route.rest;

  // `/content` opens the first collection (or the picker when there are none).
  useEffect(() => {
    if (!name && collections[0])
      navigate(workspacePath(site.id, "content", collections[0].name), { replace: true });
  }, [name, collections, navigate, site.id]);

  if (!name || name === "new")
    return <AddCollection siteId={site.id} canAdd={can(site, "designer")} />;
  const info = collectionInfo(doc, name);
  if (!info)
    return (
      <div className="st-ws-empty">
        <p>There's no collection called “{name}”.</p>
        <Button onClick={() => navigate(workspacePath(site.id, "content"))}>
          Show my collections
        </Button>
      </div>
    );
  if (item)
    return (
      <ItemEditor
        key={`${name}/${item}`}
        site={site}
        info={info}
        slug={item === "new" ? null : item}
      />
    );
  return <CollectionList key={name} site={site} info={info} />;
}

/** Pick what kind of collection to add: blog, events, portfolio, podcast or shop. */
function AddCollection({ siteId, canAdd }: { siteId: string; canAdd: boolean }) {
  const api = useDocStoreApi();
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const [kind, setKind] = useState<CollectionKind | null>(null);
  const [label, setLabel] = useState("");
  const existing = listCollections(doc);

  const create = () => {
    if (!kind) return;
    const meta = KIND_META[kind];
    const title = label.trim() || meta.label;
    const name = uniqueCollectionName(doc, title === meta.label ? meta.name : title);
    const r = api.getState().commit(configOps(name, { ...meta.config(), label: title }), {
      label: `Add ${title}`,
    });
    if (r.ok) navigate(workspacePath(siteId, "content", name));
  };

  return (
    <div className="st-ws-stack">
      <WsHeader
        title="Add a collection"
        description={
          existing.length
            ? "Collections hold things you add often. Each one gets its own page on your site, plus a feed where it makes sense."
            : "Your site doesn't have a blog, events or shop yet. Pick one to start; you can add more later."
        }
      />
      {!canAdd ? (
        <p className="st-ws-hint">Ask the owner or a designer to add a new collection.</p>
      ) : (
        <>
          <div className="st-kind-grid">
            {(Object.keys(KIND_META) as CollectionKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                className={kind === k ? "st-kind is-on" : "st-kind"}
                onClick={() => {
                  setKind(k);
                  setLabel(KIND_META[k].label);
                }}
              >
                <span className="st-kind__icon">{ICONS[k]}</span>
                <strong>{KIND_META[k].label}</strong>
                <span>{KIND_META[k].description}</span>
              </button>
            ))}
          </div>
          {kind && (
            <form
              className="st-inline-form st-kind-form"
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
            >
              <Field label="Name it">
                <Input
                  value={label}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => setLabel(e.target.value)}
                />
              </Field>
              <Button variant="primary" type="submit">
                Add {label.trim() || KIND_META[kind].label}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
