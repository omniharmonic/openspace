import { createContext, type ReactNode, useContext } from "react";
import type { DraftCache } from "../features/sync/cache";
import type { RoomClientTiming } from "../features/sync/RoomClient";

/** Runtime knobs; tests shrink the timings so flows run instantly. */
export interface StudioConfig {
  timing: {
    /** Time each "Setting up your site…" step holds before the next one starts. */
    stepMs: number;
    /** Pause on the finished progress screen before opening the editor. */
    settleMs: number;
    /** Site status polling while it's being set up. */
    pollMs: number;
    /**
     * How long a new site must keep reporting "failed" before setup shows the failure (an early
     * "failed" can be stale while the first publish is still on its way). Default 45 s.
     */
    failGraceMs?: number;
    /** After this long without going live, setup offers to carry on from your sites. Default 5 min. */
    setupTimeoutMs?: number;
    /** First wait before retrying a create that didn't get an answer. Default 2 s. */
    createRetryMs?: number;
  };
  /** Show the /kit route (dev builds and tests). */
  showKit: boolean;
  marketingUrl?: string;
  /** Draft room reconnect / offline timings (defaults in RoomClient). */
  sync?: Partial<RoomClientTiming>;
  /** Where drafts are kept on this device (default: IndexedDB). */
  draftCache?: DraftCache;
  /** This tab's id for the device cache (default: one per page load; tests set it). */
  tabId?: string;
  /** Publishing progress fallback when status messages don't arrive. */
  publishing?: { pollMs?: number; timeoutMs?: number };
}

export const defaultConfig: StudioConfig = {
  timing: { stepMs: 1100, settleMs: 700, pollMs: 1500 },
  showKit: import.meta.env.DEV,
  marketingUrl: import.meta.env.VITE_MARKETING_URL || undefined,
};

const ConfigContext = createContext<StudioConfig>(defaultConfig);

export function ConfigProvider({
  config,
  children,
}: {
  config: StudioConfig;
  children: ReactNode;
}) {
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): StudioConfig {
  return useContext(ConfigContext);
}
