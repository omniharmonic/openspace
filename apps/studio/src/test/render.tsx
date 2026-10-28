import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll } from "vitest";
import { createMockHub, type MockHubOptions } from "../api/mock";
import type { User } from "../api/types";
import type { StudioConfig } from "../app/config";
import { createQueryClient, Providers } from "../app/Providers";
import { createRoutes } from "../app/routes";
import { createMemoryDraftCache } from "../features/sync/cache";
import { useCommandStore } from "../ui/command-store";
import { useToastStore } from "../ui/toast-store";

// The editor and the workspace load on demand (React.lazy). Load them before the file's first test
// starts its clock: on a loaded machine transforming these modules alone can outlast a test's
// waits, and that is set-up cost, not the behaviour under test. (Every file that renders the
// Studio pays it anyway, in its first test.)
beforeAll(async () => {
  await Promise.all([
    import("../features/editor/EditorFrame"),
    import("../features/workspace/WorkspaceView"),
  ]);
}, 120_000);

export const FAST: Partial<StudioConfig> = {
  timing: { stepMs: 5, settleMs: 5, pollMs: 10, failGraceMs: 30, createRetryMs: 5 },
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
  /** Patch the mock Hub before the first render (e.g. to make a call fail). */
  setup?: (hub: ReturnType<typeof createMockHub>) => void,
) {
  useToastStore.getState().clear();
  useCommandStore.setState({ open: false, sources: {} });
  const hub = createMockHub({ buildMs: 0, publishStepMs: 20, ...hubOptions });
  setup?.(hub);
  // Each render gets its own device cache unless a test shares one (to simulate a reload).
  const merged: Partial<StudioConfig> = {
    ...config,
    draftCache: config.draftCache ?? createMemoryDraftCache(),
  };
  const router = createMemoryRouter(createRoutes({ showKit: config.showKit ?? true }), {
    initialEntries: [path],
  });
  const queryClient = createQueryClient({ retryBaseMs: 5 });
  const user = userEvent.setup();
  const utils = render(
    <Providers hub={hub} config={merged} queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, hub, router, user, queryClient };
}
