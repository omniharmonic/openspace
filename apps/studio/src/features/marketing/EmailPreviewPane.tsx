import type { Block } from "@omniharmonic/openspace-schema";
import { AlertTriangle, Monitor, Moon, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Segmented } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { forceDark, inertLinks, previewEmail } from "./emailPreview";

export type PreviewMode = "desktop" | "mobile" | "dark";

/** Live email preview: desktop, phone and dark mode, drawn by @omniharmonic/openspace-email-render. */
export function EmailPreviewPane({
  blocks,
  subject,
  preheader,
  baseUrl,
  fromName,
}: {
  blocks: readonly Block[];
  subject: string;
  preheader: string | null;
  baseUrl: string;
  fromName: string;
}) {
  const doc = useDocStore((s) => s.doc);
  const [mode, setMode] = useState<PreviewMode>("desktop");
  const r = useMemo(
    () => previewEmail(doc, { blocks, subject, preheader, baseUrl }),
    [doc, blocks, subject, preheader, baseUrl],
  );
  const html = useMemo(
    () => inertLinks(mode === "dark" ? forceDark(r.html) : r.html),
    [r.html, mode],
  );
  return (
    <section className="st-email-preview" aria-label="Email preview">
      <div className="st-email-preview__bar">
        <Segmented<PreviewMode>
          size="sm"
          aria-label="Preview as"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "desktop", label: <Monitor />, ariaLabel: "Computer" },
            { value: "mobile", label: <Smartphone />, ariaLabel: "Phone" },
            { value: "dark", label: <Moon />, ariaLabel: "Dark mode" },
          ]}
        />
      </div>
      <div className="st-email-preview__inbox" aria-hidden="true">
        <strong>{fromName}</strong>
        <span>
          {subject || "No subject yet"}
          {preheader ? <em> — {preheader}</em> : null}
        </span>
      </div>
      <div className={`st-email-preview__stage is-${mode}`}>
        <iframe
          title={`Email preview (${mode === "mobile" ? "phone" : mode === "dark" ? "dark mode" : "computer"})`}
          className="st-email-preview__frame"
          sandbox="allow-same-origin"
          srcDoc={html}
          style={mode === "dark" ? { colorScheme: "dark" } : undefined}
        />
      </div>
      {r.warnings.length > 0 && (
        <ul className="st-email-preview__warnings">
          {r.warnings.slice(0, 4).map((w) => (
            <li key={w}>
              <AlertTriangle aria-hidden="true" /> {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
