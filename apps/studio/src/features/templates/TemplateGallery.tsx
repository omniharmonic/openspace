import { Eye, LayoutTemplate, Monitor, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useTemplates } from "../../api";
import type { TemplateLook, TemplateSummary } from "../../api/types";
import { AppHeader } from "../../app/AppHeader";
import { LoadError } from "../../app/Connection";
import { Button, Dialog, Segmented, Skeleton, useRegisterCommands } from "../../ui";
import { LookPicker } from "./LookPicker";
import "./TemplateGallery.css";
import { TemplatePreview } from "./TemplatePreview";

type Device = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 834, mobile: 390 };

function newSitePath(template: TemplateSummary, look: string) {
  return `/new/${template.id}?look=${encodeURIComponent(look)}`;
}

function PreviewDialog({
  template,
  look,
  onLookChange,
  open,
  onOpenChange,
}: {
  template: TemplateSummary;
  look: TemplateLook;
  onLookChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device>("desktop");
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width={1120}
      className="st-gallery__dialog"
      title={template.name}
      description={`For ${template.persona.toLowerCase()}. ${template.mood}.`}
      footer={
        <>
          <div className="st-gallery__dialog-tools">
            <Segmented<Device>
              aria-label="Preview size"
              value={device}
              onValueChange={setDevice}
              options={[
                { value: "desktop", label: <Monitor />, ariaLabel: "Desktop" },
                { value: "tablet", label: <Tablet />, ariaLabel: "Tablet" },
                { value: "mobile", label: <Smartphone />, ariaLabel: "Phone" },
              ]}
            />
            <LookPicker
              looks={template.looks}
              value={look.id}
              onValueChange={onLookChange}
              label={`${template.name} looks`}
              showNames
            />
          </div>
          <Button variant="primary" onClick={() => navigate(newSitePath(template, look.id))}>
            Use {template.name}
          </Button>
        </>
      }
    >
      <div className={`st-gallery__stage st-gallery__stage--${device}`}>
        <div className="st-gallery__device">
          <TemplatePreview
            template={template}
            look={look}
            frameWidth={DEVICE_WIDTH[device]}
            interactive
            eager
          />
        </div>
      </div>
    </Dialog>
  );
}

export function TemplateCard({ template }: { template: TemplateSummary }) {
  const navigate = useNavigate();
  const [lookId, setLookId] = useState(template.looks[0]?.id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const look = template.looks.find((l) => l.id === lookId) ?? template.looks[0];
  if (!look) return null;
  return (
    <article className="st-tcard" aria-labelledby={`tpl-${template.id}`}>
      <button
        type="button"
        className="st-tcard__preview"
        onClick={() => setPreviewOpen(true)}
        aria-label={`Preview ${template.name} in the ${look.name} look`}
      >
        <TemplatePreview template={template} look={look} />
        <span className="st-tcard__hint" aria-hidden="true">
          <Eye /> Preview
        </span>
      </button>
      <div className="st-tcard__body">
        <div className="st-tcard__row">
          <h2 id={`tpl-${template.id}`} className="st-tcard__name">
            {template.name}
          </h2>
          <LookPicker
            looks={template.looks}
            value={look.id}
            onValueChange={setLookId}
            label={`${template.name} looks`}
          />
        </div>
        <p className="st-tcard__persona">{template.persona}</p>
        <p className="st-tcard__desc">{template.description}</p>
        <div className="st-tcard__actions">
          <span className="st-tcard__look">{look.name} look</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(newSitePath(template, look.id))}
          >
            Use {template.name}
          </Button>
        </div>
      </div>
      <PreviewDialog
        template={template}
        look={look}
        onLookChange={setLookId}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </article>
  );
}

export function TemplateGallery() {
  const templates = useTemplates();
  const navigate = useNavigate();
  useRegisterCommands(
    "gallery",
    (templates.data ?? []).map((t) => ({
      id: `use-${t.id}`,
      label: `Start a site with ${t.name}`,
      group: "Templates",
      icon: <LayoutTemplate />,
      keywords: [t.persona, t.mood],
      run: () => navigate(newSitePath(t, t.looks[0]?.id ?? "")),
    })),
  );

  return (
    <div className="st-page">
      <AppHeader />
      <main className="st-gallery">
        <div className="st-gallery__intro">
          <h1 className="st-gallery__title">Start from a finished site</h1>
          <p className="st-gallery__lede">
            Every template is a complete site with real pages. Pick one, give it your name, and it’s
            online in a few minutes. Browse as long as you like — no account needed.
          </p>
        </div>
        {templates.isPending ? (
          <div
            className="st-gallery__grid"
            role="status"
            aria-busy="true"
            aria-label="Loading templates"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="st-tcard st-tcard--loading">
                <Skeleton height="auto" className="st-tcard__skeleton" />
                <div className="st-tcard__body">
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="70%" height={10} />
                </div>
              </div>
            ))}
          </div>
        ) : templates.isError ? (
          <LoadError
            title="Templates didn’t load"
            error={templates.error}
            onRetry={() => void templates.refetch()}
          />
        ) : (
          <div className="st-gallery__grid">
            {templates.data.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
