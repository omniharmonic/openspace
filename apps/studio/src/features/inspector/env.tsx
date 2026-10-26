import { createContext, type ReactNode, useContext } from "react";
import { create } from "zustand";
import { useEditorUi } from "../editor/editor-store";
import { asRole, type Role } from "./model/permissions";
import { BP_OF, type Bp } from "./model/responsive";

/**
 * What the inspector needs from outside the document: the person's role on the site (from the
 * site record). The editor publishes it through {@link useSiteRoleStore} (see `Runtime`);
 * tests can wrap components in {@link InspectorEnvProvider} instead.
 */

export const useSiteRoleStore = create<{ role: string | undefined }>(() => ({ role: undefined }));

const EnvContext = createContext<{ role: Role } | null>(null);

export function InspectorEnvProvider({
  role,
  children,
}: {
  role: string | undefined;
  children: ReactNode;
}) {
  return <EnvContext.Provider value={{ role: asRole(role) }}>{children}</EnvContext.Provider>;
}

/** The person's role; without one the least privilege applies. */
export function useInspectorRole(): Role {
  const ctx = useContext(EnvContext);
  const published = useSiteRoleStore((s) => s.role);
  return ctx?.role ?? asRole(published);
}

/** The breakpoint edits target (follows the device preview). */
export function useEditBp(): Bp {
  return BP_OF[useEditorUi((s) => s.breakpoint)];
}

/** The block inspector's tab; the canvas "Style" button opens Design. */
export const useInspectorTab = create<{ tab: "content" | "design" }>(() => ({ tab: "content" }));
