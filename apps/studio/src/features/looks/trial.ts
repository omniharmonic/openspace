import type { OpBody } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { useMemo } from "react";
import { create } from "zustand";
import type { TemplateDetail } from "../../api/catalog-types";
import { lookStyles } from "../templates/personalize";
import { type LookPlan, planLook, previewLook } from "./mapping";

/** The look being tried on (shown side by side in the canvas until applied or discarded). */
interface LookTrialState {
  templateId: string | null;
  lookId: string | null;
  /** Keep the site's exact color/font tweaks on top of the look. */
  keepTweaks: boolean;
  /** Narrow screens show one side at a time. */
  side: "now" | "new";
  tryLook: (templateId: string, lookId: string) => void;
  setKeepTweaks: (keep: boolean) => void;
  setSide: (side: "now" | "new") => void;
  discard: () => void;
}

export const useLookTrial = create<LookTrialState>((set) => ({
  templateId: null,
  lookId: null,
  keepTweaks: false,
  side: "new",
  tryLook: (templateId, lookId) => set({ templateId, lookId, side: "new" }),
  setKeepTweaks: (keepTweaks) => set({ keepTweaks }),
  setSide: (side) => set({ side }),
  discard: () => set({ templateId: null, lookId: null, keepTweaks: false, side: "new" }),
}));

export interface LookResult {
  plan: LookPlan;
  /** The site with the look applied (what Apply produces). */
  doc: SiteDocument;
  /** Exactly the ops Apply commits. */
  bodies: OpBody[];
}

/** Compute a template look on the current site (pure; memoize per inputs). */
export function computeLook(
  current: SiteDocument,
  detail: TemplateDetail,
  lookId: string,
  keepTweaks: boolean,
): LookResult {
  const styles = lookStyles(detail, lookId);
  const plan = planLook(current, detail.document, styles, { keepTweaks });
  const { doc, bodies } = previewLook(current, plan);
  return { plan, doc, bodies };
}

export function useLookResult(
  current: SiteDocument,
  detail: TemplateDetail | undefined,
  lookId: string | null | undefined,
  keepTweaks: boolean,
): LookResult | undefined {
  return useMemo(
    () => (detail && lookId ? computeLook(current, detail, lookId, keepTweaks) : undefined),
    [current, detail, lookId, keepTweaks],
  );
}
