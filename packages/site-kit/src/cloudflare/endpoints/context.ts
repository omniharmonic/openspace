/// <reference path="../../virtual.d.ts" />
import { doc, options } from "virtual:openspace/site";
import type { GateContext, GateEnv } from "../handlers";

/** Handler context from the integration's virtual module. */
export function gateContext(): GateContext {
  return {
    doc,
    location: options.location,
    assets: options.assets,
    fontStylesheets: options.fontStylesheets,
    hubUrl: options.hubUrl,
    turnstileSiteKey: options.turnstileSiteKey,
    // `astro dev` with gated content in the working copy; a deployed Worker reads only R2.
    devFallback: options.dev === true,
  };
}

/** The Worker env (`cloudflare:workers`), imported lazily so prerendering never touches it. */
export async function workerEnv(): Promise<GateEnv> {
  const specifier = "cloudflare:workers";
  const mod = (await import(/* @vite-ignore */ specifier)) as { env: GateEnv };
  return mod.env;
}
