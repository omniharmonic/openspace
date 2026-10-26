import { ChevronRight, FilePlus2, FileText } from "lucide-react";
import { Button, cx } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { useManageUi } from "../site-mgmt/manage-ui";
import "./mobile.css";

import { pagesInOrder } from "./helpers";

export function PageList({ onOpen }: { onOpen: (pageId: string) => void }) {
  const doc = useDocStore((s) => s.doc);
  const current = useDocStore((s) => s.pageId);
  const pages = pagesInOrder(doc);
  return (
    <div className="st-mob__screen" data-testid="mobile-pages">
      <h1 className="st-mob__h1">Pages</h1>
      <ul className="st-mob__list" aria-label="Pages">
        {pages.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={cx("st-mob__row", p.id === current && "is-current")}
              onClick={() => onOpen(p.id)}
            >
              <FileText aria-hidden="true" className="st-mob__row-icon" />
              <span className="st-mob__row-text">
                <span className="st-mob__row-title">{p.title}</span>
                <span className="st-mob__row-sub">
                  /{p.slug}
                  {p.hidden ? " · hidden" : ""} · {p.sections.length}{" "}
                  {p.sections.length === 1 ? "section" : "sections"}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="st-mob__chev" />
            </button>
          </li>
        ))}
      </ul>
      <div className="st-mob__actions">
        <Button
          variant="secondary"
          icon={<FilePlus2 />}
          onClick={() => useManageUi.getState().openAddPage()}
        >
          Add page
        </Button>
      </div>
    </div>
  );
}
