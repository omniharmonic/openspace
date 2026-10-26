/**
 * The workspace: content, inbox, marketing and store screens opened over the editor at
 * `/sites/:id/<area>/…` (the same pattern as settings). Hub emails link straight here, e.g.
 * `/sites/:id/inbox?entry=<id>` and `/sites/:id/analytics`.
 */

export const AREAS = [
  "content",
  "approvals",
  "inbox",
  "subscribers",
  "members",
  "campaigns",
  "analytics",
  "orders",
  "products",
  "store",
  "donations",
] as const;

export type Area = (typeof AREAS)[number];

export interface WorkspaceRoute {
  area: Area;
  /** Path segments after the area, e.g. ["journal", "slow-mornings"]. */
  rest: string[];
}

const RE = new RegExp(`^/sites/[^/]+/(${AREAS.join("|")})(?:/(.*?))?/?$`);

/** The workspace screen the URL asks for, or null when the editor is showing. */
export function workspaceRoute(pathname: string): WorkspaceRoute | null {
  const m = RE.exec(pathname);
  if (!m) return null;
  const rest = (m[2] ?? "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  return { area: m[1] as Area, rest };
}

/** `/sites/<id>/<area>/<rest…>` */
export function workspacePath(siteId: string, area: Area, ...rest: string[]): string {
  return [`/sites/${siteId}/${area}`, ...rest.map((s) => encodeURIComponent(s))].join("/");
}
