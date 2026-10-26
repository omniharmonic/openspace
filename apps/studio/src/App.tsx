import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import type { HubApi } from "./api/types";
import { defaultConfig, type StudioConfig } from "./app/config";
import { Providers } from "./app/Providers";
import { createRoutes } from "./app/routes";
import "./styles/tokens.css";
import "./styles/base.css";

export interface AppProps {
  hub: HubApi;
  config?: Partial<StudioConfig>;
}

/** OpenSpace Studio. */
export function App({ hub, config }: AppProps) {
  const [router] = useState(() =>
    createBrowserRouter(createRoutes({ showKit: config?.showKit ?? defaultConfig.showKit })),
  );
  return (
    <Providers hub={hub} config={config}>
      <RouterProvider router={router} />
    </Providers>
  );
}
