import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { HubProvider } from "../api/context";
import { isTransientError } from "../api/resilience";
import type { HubApi } from "../api/types";
import { CommandPalette, Toaster, TooltipProvider } from "../ui";
import { ConnectionStatus } from "./Connection";
import { ConfigProvider, defaultConfig, type StudioConfig } from "./config";
import { useThemeSync } from "./theme";

function ThemeSync() {
  useThemeSync();
  return null;
}

export function createQueryClient(opts: { retryBaseMs?: number } = {}) {
  const base = opts.retryBaseMs ?? 1000;
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A temporary Hub failure (no answer, 502/503/504) is worth a few more tries; the HTTP
        // client has already retried it with backoff, so these are slower, spaced-out attempts.
        retry: (count, err) =>
          isTransientError(err) ? count < 3 : count < 2 && !(err as { status?: number })?.status,
        retryDelay: (attempt) =>
          Math.min(base * 2 ** attempt, 8 * base) * (0.5 + Math.random() / 2),
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
            <ConnectionStatus />
          </TooltipProvider>
        </ConfigProvider>
      </HubProvider>
    </QueryClientProvider>
  );
}
