/** `/members/[...path]` and every password/members page: server-rendered on the Worker. */
import { handleGatedPage } from "../handlers";
import { gateContext, workerEnv } from "./context";

export const prerender = false;

export async function GET({ request }: { request: Request }): Promise<Response> {
  return handleGatedPage(request, await workerEnv(), gateContext());
}
