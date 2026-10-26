import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { hubFromEnv } from "./api";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App hub={hubFromEnv()} />
  </StrictMode>,
);
