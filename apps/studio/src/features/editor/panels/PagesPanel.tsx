import type { Page, SiteDocument } from "@openspace/schema";
import { EyeOff, FileText, House } from "lucide-react";
import { cx } from "../../../ui";
import { useDocStore, useDocStoreApi } from "../model/context";

/** Pages in navigation order first, then any pages not in the navigation. */
export function orderedPages(doc: SiteDocument): Page[] {
  const seen = new Set<string>();
  const out: Page[] = [];
  const visit = (items: SiteDocument["site"]["nav"]) => {
    for (const item of items) {
      if (item.type === "page") {
        const p = doc.pages[item.page as keyof SiteDocument["pages"]];
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          out.push(p);
        }
      } else if (item.type === "folder") visit(item.items as SiteDocument["site"]["nav"]);
    }
  };
  visit(doc.site.nav);
  for (const p of Object.values(doc.pages)) if (!seen.has(p.id)) out.push(p);
  return out;
}

export function PagesPanel() {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const current = useDocStore((s) => s.pageId);
  const pages = orderedPages(doc);
  return (
    <nav className="st-pages" aria-label="Site pages">
      <ul>
        {pages.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={cx("st-pages__item", p.id === current && "is-current")}
              aria-current={p.id === current ? "page" : undefined}
              onClick={() => api.getState().setPage(p.id)}
            >
              {p.slug === "" ? <House aria-hidden="true" /> : <FileText aria-hidden="true" />}
              <span className="st-pages__title">{p.title}</span>
              <span className="st-pages__path">/{p.slug}</span>
              {p.hidden && <EyeOff aria-label="Hidden from navigation" />}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
