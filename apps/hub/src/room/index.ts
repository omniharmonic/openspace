import type { HubBindings } from "../env";
import { HttpError } from "../lib/errors";
import type { DraftRoom, RoomResult } from "./draft-room";

export type { RoomActorInput, RoomResult } from "./draft-room";
export { DraftRoom, FLUSH_IDLE_MS, FLUSH_MAX_OPS } from "./draft-room";
export * from "./protocol";

/**
 * The DraftRoom's RPC surface as plain async methods. (The generated stub type distributes over
 * union results; the values that cross RPC are plain structured clones of these types.)
 */
export type RoomApi = {
  [K in keyof DraftRoom as DraftRoom[K] extends (...args: never[]) => Promise<unknown>
    ? K
    : never]: DraftRoom[K];
};

/** The site's DraftRoom (one Durable Object per site id). */
export function roomStub(env: HubBindings, siteId: string): RoomApi {
  return (env.DRAFT_ROOM as unknown as DurableObjectNamespace<DraftRoom>).getByName(
    siteId,
  ) as unknown as RoomApi;
}

/** Await a room RPC result; a client-facing failure becomes an `HttpError` again. */
export async function unwrapRoom<T>(call: Promise<RoomResult<T>>): Promise<T> {
  const r = await call;
  if (r.ok) return r.value;
  throw new HttpError(
    r.error.status as ConstructorParameters<typeof HttpError>[0],
    r.error.code,
    r.error.message,
    r.error.details,
  );
}
