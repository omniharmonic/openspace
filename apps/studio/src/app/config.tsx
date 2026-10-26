import { createContext, type ReactNode, useContext } from "react";

/** Runtime knobs; tests shrink the timings so flows run instantly. */
export interface StudioConfig {
  timing: {
    /** Time each "Setting up your site…" step holds before the next one starts. */
    stepMs: number;
    /** Pause on the finished progress screen before opening the editor. */
    settleMs: number;
    /** Site status polling while it's being set up. */
    pollMs: number;
  };
  /** Show the /kit route (dev builds and tests). */
  showKit: boolean;
  marketingUrl?: string;
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
