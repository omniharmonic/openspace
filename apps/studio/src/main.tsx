import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { hubFromEnv } from "./api";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
const hub = await hubFromEnv();
createRoot(root).render(
  <StrictMode>
    <App hub={hub} />
  </StrictMode>,
);
