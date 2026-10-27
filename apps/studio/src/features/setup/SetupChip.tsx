import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Tooltip } from "../../ui";
import { progress } from "./checklist";
import { useSetupChecklist } from "./FinishSetup";
import "./setup.css";

/** Editor top bar: "Finish setting up · 2 left", until everything's done. */
export function SetupChip({ site }: { site: Site }) {
  const navigate = useNavigate();
  const { items, loading } = useSetupChecklist(site);
  const p = progress(items);
  if (loading || site.status === "building" || p.left === 0) return null;
  return (
    <Tooltip content="What's left to make your site complete — each step is guided">
      <button
        type="button"
        className="st-setup-chip"
        onClick={() => navigate(`/sites/${site.id}/settings/setup`)}
      >
        <span
          className="st-setup-chip__ring"
          aria-hidden="true"
          style={{ "--p": p.total ? p.done / p.total : 0 } as React.CSSProperties}
        />
        Finish setting up
        <span className="st-ed-hide-narrow">· {p.left} left</span>
      </button>
    </Tooltip>
  );
}
