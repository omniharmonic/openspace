import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { HubProvider } from "../api/context";
import type { HubApi } from "../api/types";
import { CommandPalette, Toaster, TooltipProvider } from "../ui";
import { ConfigProvider, defaultConfig, type StudioConfig } from "./config";
import { useThemeSync } from "./theme";

function ThemeSync() {
  useThemeSync();
  return null;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => count < 2 && !(err as { status?: number })?.status,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export interface ProvidersProps {
  hub: HubApi;
  config?: Partial<StudioConfig>;
  queryClient?: QueryClient;
  children: ReactNode;
}

/** Everything the Studio tree needs: data, Hub client, config, tooltips, toasts, ⌘K. */
export function Providers({ hub, config, queryClient, children }: ProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  const merged: StudioConfig = {
    ...defaultConfig,
    ...config,
    timing: { ...defaultConfig.timing, ...config?.timing },
  };
  return (
    <QueryClientProvider client={client}>
      <HubProvider hub={hub}>
        <ConfigProvider config={merged}>
          <TooltipProvider>
            <ThemeSync />
            {children}
            <CommandPalette />
            <Toaster />
          </TooltipProvider>
        </ConfigProvider>
      </HubProvider>
    </QueryClientProvider>
  );
}
