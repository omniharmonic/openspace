import { createContext, type ReactNode, useContext } from "react";
import type { HubApi } from "./types";

const HubContext = createContext<HubApi | null>(null);

export function HubProvider({ hub, children }: { hub: HubApi; children: ReactNode }) {
  return <HubContext.Provider value={hub}>{children}</HubContext.Provider>;
}

export function useHub(): HubApi {
  const hub = useContext(HubContext);
  if (!hub) throw new Error("useHub must be used inside <HubProvider>");
  return hub;
}
