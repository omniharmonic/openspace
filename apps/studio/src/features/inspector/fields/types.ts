import type { Block, FieldMeta, SiteDocument } from "@omniharmonic/openspace-schema";
import { createContext, useContext } from "react";
import type { Capabilities } from "../model/permissions";

export interface ChangeOptions {
  /** Group rapid changes (typing, scrubbing) into one undo step. */
  merge?: boolean;
  label?: string;
}

/** Commit a new value for a field; returns a plain-language error, or null when saved. */
export type FieldChange<V = unknown> = (
  value: V | undefined,
  options?: ChangeOptions,
) => string | null;

export interface ControlProps<M extends FieldMeta = FieldMeta, V = unknown> {
  id: string;
  meta: M;
  label: string;
  value: V | undefined;
  onChange: FieldChange<V>;
  disabled?: boolean;
}

/** What field controls can read about where they are. */
export interface FieldsContextValue {
  doc: SiteDocument;
  pageId: string;
  block: Block;
  caps: Capabilities;
}

export const FieldsContext = createContext<FieldsContextValue | null>(null);

export function useFieldsContext(): FieldsContextValue {
  const ctx = useContext(FieldsContext);
  if (!ctx) throw new Error("Field controls must be inside <FieldsContext>");
  return ctx;
}

/** Make a validation message readable ("Too big: expected string to have <=80 characters"). */
export function friendlyError(message: string | undefined): string {
  if (!message) return "That change couldn’t be saved.";
  const max = /<=?\s*(\d+)\s*characters/.exec(message);
  if (max) return `Keep it to ${max[1]} characters or fewer.`;
  const min = />=?\s*(\d+)\s*characters/.exec(message);
  if (min) return min[1] === "1" ? "This can’t be empty." : `Use at least ${min[1]} characters.`;
  if (/single line/i.test(message)) return "Keep this to one line.";
  if (/^Too (small|big)/.test(message))
    return message.replace(/^Too (small|big): expected /, "Expected ");
  return message.replace(/^Invalid input: /, "");
}
