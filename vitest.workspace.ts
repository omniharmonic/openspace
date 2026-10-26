import { defineWorkspace } from "vitest/config";

// Lets editors / `vitest` at the root discover every package's tests.
export default defineWorkspace([
  "apps/*",
  "packages/*",
  "templates",
  "templates/starter",
  "tools/*",
  "plugin",
]);
