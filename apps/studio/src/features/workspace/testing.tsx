import { screen } from "@testing-library/react";
import { demoSites } from "../../api/fixtures";
import type { MockHubOptions } from "../../api/mock";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import type { EditorStore } from "../editor/model/store";

export const SITES = demoSites(SAM.login, Date.UTC(2026, 9, 1));
export const WILLOW = SITES[0] as Site;

/** Open a workspace screen (`/sites/willow/<path>`) against the mock Hub with demo content. */
export async function openWorkspace(
  path: string,
  options: { site?: Partial<Site>; hub?: MockHubOptions } = {},
) {
  const sites = SITES.map((s) => (s.id === WILLOW.id ? { ...s, ...options.site } : s));
  const utils = renderStudio(`/sites/${WILLOW.id}/${path}`, {
    user: SAM,
    sites,
    demoContent: true,
    ...options.hub,
  });
  // The editor and the workspace screens load on demand; the first open in a file can be slow.
  await screen.findByRole("region", { name: "Site content and business" }, { timeout: 15_000 });
  return utils;
}

export const editorStore = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();

/** Git and hosting words never appear outside Advanced settings (Global Constraint 9). */
export const FORBIDDEN =
  /\b(repo|repository|repositories|commit\w*|branch\w*|build\w*|deploy\w*)\b/gi;

export function visibleCopy(): string {
  let text = `${document.body.textContent ?? ""} `;
  for (const el of document.querySelectorAll("[aria-label],[placeholder],[title],[alt]"))
    for (const attr of ["aria-label", "placeholder", "title", "alt"]) {
      const v = el.getAttribute(attr);
      if (v) text += ` ${v}`;
    }
  return text;
}
