import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { queryKeys } from "../../api";
import { useHub } from "../../api/context";
import type { Site } from "../../api/types";
import { useOfflineState } from "../../pwa/offline";
import { Button, Spinner } from "../../ui";

/** After this long still "being set up", offer a way back to the sites list. */
export const SETTING_UP_SLOW_MS = 3 * 60_000;

/**
 * What the editor shows while a site is being set up. It only says "being set up" while the
 * Hub is actually answering: if the latest check failed (or the copy came from this device),
 * it can't know whether setup has finished, so it says so and keeps trying.
 */
export function SettingUp({ site }: { site: Site }) {
  const hub = useHub();
  const navigate = useNavigate();
  // Watches the editor's own site query (which polls); never fetches by itself.
  const q = useQuery({
    queryKey: queryKeys.site(site.id),
    queryFn: () => hub.getSite(site.id),
    enabled: false,
  });
  const fromDevice = useOfflineState((s) => s.fromDevice);
  const unreachable = fromDevice || q.errorUpdatedAt > q.dataUpdatedAt;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SETTING_UP_SLOW_MS);
    return () => clearTimeout(t);
  }, []);

  if (unreachable)
    return (
      <>
        <Spinner size={16} />
        <p role="status">
          We can’t reach OpenSpace right now, so we can’t tell whether your site is ready yet.
          Trying again…
        </p>
        <Button size="sm" onClick={() => void q.refetch()}>
          Try now
        </Button>
      </>
    );
  return (
    <>
      <Spinner size={16} />
      <p role="status">Your site is still being set up. It opens here in a moment.</p>
      {slow && (
        <Button size="sm" variant="ghost" onClick={() => navigate("/sites")}>
          Back to your sites
        </Button>
      )}
    </>
  );
}
