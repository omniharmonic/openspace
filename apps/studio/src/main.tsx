import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { hubFromEnv } from "./api";
import { withOfflineCache } from "./pwa/offline";
import { listenForInstall, registerServiceWorker } from "./pwa/register";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
// Installable and offline-capable (production builds only; never in dev or tests).
registerServiceWorker();
listenForInstall();
const hub = withOfflineCache(await hubFromEnv());
createRoot(root).render(
  <StrictMode>
    <App hub={hub} />
  </StrictMode>,
);
