/** `/_os/auth/password`: shared page password form target. */
import { handlePasswordSubmit } from "../handlers";
import { gateContext, workerEnv } from "./context";

export const prerender = false;

export async function POST({ request }: { request: Request }): Promise<Response> {
  return handlePasswordSubmit(request, await workerEnv(), gateContext());
}
