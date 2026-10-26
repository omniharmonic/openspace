import { ArrowUpRight, Download, FileArchive, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { type ExportKind, useHub } from "../../api";
import type { Site } from "../../api/types";
import { Button, toast } from "../../ui";

/** Save a Blob as a file. */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DATA: Array<{ kind: ExportKind; title: string; desc: string }> = [
  {
    kind: "data",
    title: "Everything (ZIP)",
    desc: "Form entries, subscribers and orders, one spreadsheet each.",
  },
  {
    kind: "submissions",
    title: "Form entries",
    desc: "Every message from your forms, as a spreadsheet.",
  },
  {
    kind: "subscribers",
    title: "Subscribers",
    desc: "Your newsletter list, with sign-up dates and tags.",
  },
  { kind: "members", title: "Members", desc: "People with member accounts and their tiers." },
];

/** Export: the site's own files (from GitHub) and the data OpenSpace keeps for it. */
export function ExportSettings({ site }: { site: Site }) {
  const hub = useHub();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const download = async (kind: ExportKind) => {
    setBusy(kind);
    try {
      const file = await hub.downloadExport(site.id, kind);
      saveFile(file.blob, file.filename);
    } catch (err) {
      toast({ tone: "danger", title: "Couldn’t download", description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="st-settings__stack">
      <p className="st-settings__lede">It's already yours. Download a copy whenever you like.</p>
      <section className="st-card" aria-labelledby="exp-files">
        <div className="st-card__head">
          <div>
            <h3 id="exp-files" className="st-card__title">
              <FileArchive aria-hidden="true" className="st-inline-icon" /> Your site's files
            </h3>
            <p className="st-card__desc">
              Every page, image and setting as a ZIP, straight from your GitHub account.
            </p>
          </div>
          <a
            className="st-btnlink"
            href={`https://github.com/${site.repo}/archive/refs/heads/main.zip`}
            target="_blank"
            rel="noreferrer"
          >
            <Download aria-hidden="true" /> Download ZIP <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </section>
      <section className="st-card" aria-labelledby="exp-data">
        <h3 id="exp-data" className="st-card__title">
          <FileSpreadsheet aria-hidden="true" className="st-inline-icon" /> Your visitors' data
        </h3>
        <ul className="st-exports">
          {DATA.map((d) => (
            <li key={d.kind}>
              <div>
                <strong>{d.title}</strong>
                <span className="st-muted-note">{d.desc}</span>
              </div>
              <Button
                size="sm"
                icon={<Download />}
                loading={busy === d.kind}
                onClick={() => void download(d.kind)}
              >
                {d.kind === "data" ? "Download ZIP" : "Download CSV"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
