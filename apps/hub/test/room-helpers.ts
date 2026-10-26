import { env, runDurableObjectAlarm } from "cloudflare:test";
import type { Op } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { createApp } from "../src/app";
import { roomStub } from "../src/room";
import type { DraftRoom } from "../src/room/draft-room";
import type { ServerMessage } from "../src/room/protocol";
import { call, devLogin, type TestApp } from "./helpers";

/** Block/section ids of the built-in "basic" template. */
export const T = {
  home: "pg_0kwdyvhkbk",
  hero: "sec_82grb86199",
  offer: "sec_x2z9xgd020",
  contact: "sec_3qsdyr3fyx",
  heroTitle: "blk_fa1xy14dt9",
  heroLead: "blk_2zehhz8y61",
  heroButton: "blk_mftmbvh3dx",
  offerTitle: "blk_cpjkpm4c84",
  offer1: "blk_cp0brkg43g",
  contactText: "blk_jrv3bsxtqv",
} as const;

export const para = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

let opCounter = 0;
/** An op with fresh metadata (the room overwrites `actor` and clamps `ts`). */
export function op(body: Record<string, unknown>, ts = Date.now()): Op {
  opCounter++;
  return {
    ...body,
    id: `op-${opCounter}-${Math.random().toString(36).slice(2, 8)}`,
    actor: "x",
    ts,
  } as Op;
}

export const setText = (block: string, text: string, ts?: number) =>
  op({ op: "block.update", page: T.home, block, set: { content: para(text) } }, ts);

export async function createSite(app: TestApp, cookie: string, name = "Room Site") {
  const res = await call(app, "/api/sites", {
    method: "POST",
    cookie,
    json: { template: "basic", name },
  });
  if (res.status !== 201) throw new Error(`create failed ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; repo: string; status: string };
}

export async function addMember(siteId: string, userId: string, role: string, locked?: string[]) {
  await env.HUB_DB.prepare(
    "INSERT INTO site_roles (site_id, user_id, role, locked_sections, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (site_id, user_id) DO UPDATE SET role = excluded.role, locked_sections = excluded.locked_sections",
  )
    .bind(siteId, userId, role, locked ? JSON.stringify(locked) : null, Date.now())
    .run();
}

export async function userId(app: TestApp, cookie: string): Promise<string> {
  const me = (await (await call(app, "/api/me", { cookie })).json()) as { user: { id: string } };
  return me.user.id;
}

/** The room's RPC surface (results are `RoomResult`s; see `unwrapRoom`). */
export function room(siteId: string) {
  return roomStub(env as never, siteId);
}

/** The raw stub, for `runInDurableObject` / alarms. */
export function rawRoom(siteId: string): DurableObjectStub<DraftRoom> {
  return (env.DRAFT_ROOM as unknown as DurableObjectNamespace<DraftRoom>).getByName(siteId);
}

/** Run the room's pending alarm (the idle flush) now. */
export async function runFlushAlarm(siteId: string): Promise<boolean> {
  return runDurableObjectAlarm(rawRoom(siteId));
}

/** A Studio-like WebSocket client that records every message. */
export class RoomClient {
  readonly messages: ServerMessage[] = [];
  private waiters: Array<() => void> = [];
  seq = 0;
  doc: SiteDocument | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      this.messages.push(msg);
      if (msg.type === "hello") {
        this.seq = msg.seq;
        if (msg.doc) this.doc = msg.doc;
      }
      if (msg.type === "ack" || msg.type === "op") this.seq = Math.max(this.seq, msg.seq);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  static async connect(app: TestApp, siteId: string, cookie: string, since?: number) {
    const res = await call(
      app,
      `/api/sites/${siteId}/room${since === undefined ? "" : `?since=${since}`}`,
      {
        cookie,
        headers: { Upgrade: "websocket" },
      },
    );
    if (res.status !== 101 || !res.webSocket)
      throw new Error(`connect failed ${res.status} ${await res.text()}`);
    res.webSocket.accept();
    const client = new RoomClient(res.webSocket);
    await client.waitFor((m) => m.type === "hello");
    return client;
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg));
  }

  sendOp(o: Op, baseSeq = this.seq) {
    this.send({ type: "op", op: o, baseSeq });
  }

  async waitFor<T extends ServerMessage>(
    pred: (m: ServerMessage) => boolean,
    timeoutMs = 3000,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(pred);
      if (found) return found as T;
      const left = deadline - Date.now();
      if (left <= 0)
        throw new Error(`timed out; got ${JSON.stringify(this.messages.map((m) => m.type))}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  of<K extends ServerMessage["type"]>(type: K): Extract<ServerMessage, { type: K }>[] {
    return this.messages.filter((m) => m.type === type) as Extract<ServerMessage, { type: K }>[];
  }

  close() {
    try {
      this.ws.close(1000, "done");
    } catch {
      /* closed */
    }
  }
}

export async function setup(names: string[] = ["Maya Lin"]) {
  const app = createApp();
  const cookies: string[] = [];
  for (const n of names) cookies.push(await devLogin(app, n));
  const owner = cookies[0] as string;
  const site = await createSite(app, owner);
  return { app, cookies, owner, site };
}
