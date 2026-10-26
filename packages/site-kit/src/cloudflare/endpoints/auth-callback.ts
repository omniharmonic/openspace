/** `/_os/auth/callback`: magic-link landing (verifies the Hub token, sets the session). */
import { handleAuthCallback } from "../handlers";
import { gateContext, workerEnv } from "./context";

export const prerender = false;

export async function GET({ request }: { request: Request }): Promise<Response> {
  return handleAuthCallback(request, await workerEnv(), gateContext());
}
