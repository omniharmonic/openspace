import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useDeleteSite } from "../../api";
import type { Site } from "../../api/types";
import { Button, Field, Input, toast } from "../../ui";

/** Delete site (FR-4): typed confirmation; files are archived, data kept 30 days for export. */
export function DeleteSiteSettings({ site }: { site: Site }) {
  const navigate = useNavigate();
  const del = useDeleteSite();
  const [typed, setTyped] = useState("");
  const match = typed.trim() === site.name;
  return (
    <div className="st-settings__stack">
      <section className="st-card st-card--danger" aria-labelledby="del-title">
        <div className="st-callout st-callout--danger" role="note">
          <TriangleAlert aria-hidden="true" />
          <div>
            <strong id="del-title">This takes {site.name} offline.</strong> Its files are archived
            in your GitHub account (you can bring them back from there), and the form entries,
            subscribers and orders OpenSpace keeps are removed after 30 days. Download them first in
            Export.
          </div>
        </div>
        <form
          className="st-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!match) return;
            del.mutate(
              { id: site.id, confirmName: typed.trim() },
              {
                onSuccess: () => {
                  toast({ title: `${site.name} was deleted` });
                  navigate("/sites");
                },
                onError: (err) =>
                  toast({
                    tone: "danger",
                    title: "Couldn’t delete the site",
                    description: err.message,
                  }),
              },
            );
          }}
        >
          <Field
            label={
              <>
                Type <strong>{site.name}</strong> to confirm
              </>
            }
          >
            <Input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </Field>
          <Button type="submit" variant="danger" disabled={!match} loading={del.isPending}>
            Delete this site
          </Button>
        </form>
      </section>
    </div>
  );
}
