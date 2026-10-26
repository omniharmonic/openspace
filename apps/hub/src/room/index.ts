import type { HubBindings } from "../env";
import type { DraftRoom } from "./draft-room";

export type { RoomActorInput } from "./draft-room";
export { DraftRoom, FLUSH_IDLE_MS, FLUSH_MAX_OPS } from "./draft-room";
export * from "./protocol";

/** The site's DraftRoom (one Durable Object per site id). */
export function roomStub(env: HubBindings, siteId: string): DurableObjectStub<DraftRoom> {
  return (env.DRAFT_ROOM as unknown as DurableObjectNamespace<DraftRoom>).getByName(siteId);
}
