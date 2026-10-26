import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createMockHub, type MockHubOptions } from "../api/mock";
import type { User } from "../api/types";
import type { StudioConfig } from "../app/config";
import { createQueryClient, Providers } from "../app/Providers";
import { createRoutes } from "../app/routes";
import { createMemoryDraftCache } from "../features/sync/cache";
import { useCommandStore } from "../ui/command-store";
import { useToastStore } from "../ui/toast-store";

export const FAST: Partial<StudioConfig> = {
  timing: { stepMs: 5, settleMs: 5, pollMs: 10 },
  showKit: true,
  sync: {
    reconnectBaseMs: 10,
    reconnectMaxMs: 40,
    hubDownMs: 150,
    helloTimeoutMs: 2000,
    heartbeatMs: 60_000,
  },
};

export const SAM: User = {
  id: "gh_1001",
  login: "sam-rivera",
  name: "Sam Rivera",
  avatarUrl: null,
};

/** Renders the whole Studio at `path` against an in-memory mock Hub. */
export function renderStudio(
  path: string,
  hubOptions: MockHubOptions = {},
  config: Partial<StudioConfig> = FAST,
) {
  useToastStore.getState().clear();
  useCommandStore.setState({ open: false, sources: {} });
  const hub = createMockHub({ buildMs: 0, publishStepMs: 20, ...hubOptions });
  // Each render gets its own device cache unless a test shares one (to simulate a reload).
  const merged: Partial<StudioConfig> = {
    ...config,
    draftCache: config.draftCache ?? createMemoryDraftCache(),
  };
  const router = createMemoryRouter(createRoutes({ showKit: config.showKit ?? true }), {
    initialEntries: [path],
  });
  const queryClient = createQueryClient();
  const user = userEvent.setup();
  const utils = render(
    <Providers hub={hub} config={merged} queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, hub, router, user, queryClient };
}
