import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/env";
import { readPublicConfig } from "../src/public-env";
import {
  CloudflareEmailSender,
  EmailSendError,
  PostmarkEmailSender,
  ResendEmailSender,
} from "../src/services/email";
import { createPublicServices } from "../src/services/public";
import { call } from "./helpers";
import { mockFetch, status } from "./mock-fetch";
import { makePublicApp, outbox } from "./public-helpers";

const MSG = {
  to: "ana@example.com",
  from: { email: "no-reply@hub.example", name: "Maya Yoga via OpenSpace" },
  subject: "Confirm your subscription",
  html: "<p>Hi</p>",
  text: "Hi",
  kind: "newsletter-confirm",
  replyTo: "maya@example.com",
  headers: {
    "List-Unsubscribe": "<https://hub.example/n/unsubscribe/x>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
};

describe("EmailSender implementations", () => {
  it("Cloudflare Email Service binding", async () => {
    const sent: unknown[] = [];
    const binding = {
      send: async (m: unknown) => {
        sent.push(m);
        return { messageId: "cf-1" };
      },
    } as unknown as SendEmail;
    expect(await new CloudflareEmailSender(binding).send(MSG)).toEqual({
      id: "cf-1",
      provider: "cloudflare",
    });
    expect(sent[0]).toEqual({
      to: MSG.to,
      from: MSG.from,
      subject: MSG.subject,
      html: MSG.html,
      text: MSG.text,
      replyTo: MSG.replyTo,
      headers: MSG.headers,
    });
    const failing = {
      send: async () => {
        throw Object.assign(new Error("domain not verified"), { code: "E_SENDER_NOT_VERIFIED" });
      },
    } as unknown as SendEmail;
    await expect(new CloudflareEmailSender(failing).send(MSG)).rejects.toThrow(
      /E_SENDER_NOT_VERIFIED/,
    );
  });

  it("Resend over fetch", async () => {
    const key = ["re", "test", "key"].join("_");
    const mock = mockFetch([["POST", /api\.resend\.com\/emails/, () => ({ id: "rs-1" })]]);
    expect(await new ResendEmailSender(key, mock.fetch).send(MSG)).toEqual({
      id: "rs-1",
      provider: "resend",
    });
    expect(mock.calls[0]?.headers.get("authorization")).toBe(`Bearer ${key}`);
    expect(mock.calls[0]?.body).toMatchObject({
      from: "Maya Yoga via OpenSpace <no-reply@hub.example>",
      to: ["ana@example.com"],
      reply_to: "maya@example.com",
      headers: MSG.headers,
      tags: [{ name: "kind", value: "newsletter-confirm" }],
    });
    const bad = mockFetch([
      ["POST", /resend/, () => status(422, { message: "Invalid `to` field" })],
    ]);
    await expect(new ResendEmailSender(key, bad.fetch).send(MSG)).rejects.toBeInstanceOf(
      EmailSendError,
    );
  });

  it("Postmark over fetch", async () => {
    const token = ["pm", "server", "token"].join("-");
    const mock = mockFetch([
      ["POST", /api\.postmarkapp\.com\/email/, () => ({ MessageID: "pm-1", ErrorCode: 0 })],
    ]);
    expect(await new PostmarkEmailSender(token, mock.fetch).send(MSG)).toEqual({
      id: "pm-1",
      provider: "postmark",
    });
    expect(mock.calls[0]?.headers.get("x-postmark-server-token")).toBe(token);
    expect(mock.calls[0]?.body).toMatchObject({
      From: "Maya Yoga via OpenSpace <no-reply@hub.example>",
      To: "ana@example.com",
      ReplyTo: "maya@example.com",
      MessageStream: "outbound",
      Headers: [
        { Name: "List-Unsubscribe", Value: MSG.headers["List-Unsubscribe"] },
        { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
      ],
    });
    const bad = mockFetch([
      ["POST", /postmark/, () => status(422, { ErrorCode: 300, Message: "Invalid email request" })],
    ]);
    await expect(new PostmarkEmailSender(token, bad.fetch).send(MSG)).rejects.toThrow(
      "Invalid email request",
    );
  });

  it("selects the dev outbox in DEV_MODE or without credentials, a real sender otherwise", () => {
    const base = { ...env, DEV_MODE: "false", HUB_URL: "https://hub.example" } as never;
    const prod = readConfig(base);
    const fake = { send: async () => ({ messageId: "x" }) } as unknown as SendEmail;
    const deps = { db: env.HUB_DB, fetch: fetch, now: Date.now };
    expect(
      createPublicServices({ ...(base as object), EMAIL: fake } as never, prod, deps).email.kind,
    ).toBe("cloudflare");
    expect(
      createPublicServices({ ...(base as object), RESEND_API_KEY: "k" } as never, prod, deps).email
        .kind,
    ).toBe("resend");
    expect(
      createPublicServices(
        {
          ...(base as object),
          POSTMARK_TOKEN: "k",
          EMAIL_PROVIDER: "postmark",
          EMAIL: fake,
        } as never,
        prod,
        deps,
      ).email.kind,
    ).toBe("postmark");
    expect(createPublicServices(base, prod, deps).email.kind).toBe("dev");
    const dev = readConfig(env as never);
    expect(
      createPublicServices({ ...(env as object), EMAIL: fake } as never, dev, deps).email.kind,
    ).toBe("dev");
    const pc = readPublicConfig({ EMAIL_FROM: '"Hub" <hello@hub.example>' }, prod);
    expect(pc.emailFrom).toEqual({ email: "hello@hub.example", name: "Hub" });
    expect(readPublicConfig({}, prod).emailFrom).toEqual({
      email: "no-reply@hub.example",
      name: "OpenSpace",
    });
    expect(readPublicConfig({ TURNSTILE_SECRET: "s" }, prod).turnstile.dev).toBe(false);
    expect(readPublicConfig({ TURNSTILE_SECRET: "s" }, dev).turnstile.dev).toBe(true);
  });
});

describe("dev outbox", () => {
  it("shows sent mail as HTML and JSON, sandboxes bodies and can be cleared", async () => {
    const app = makePublicApp();
    await call(app, "/auth/dev/login", { method: "POST", json: { name: "Maya Lin" } });
    const services = (await import("../src/services")).createServices(
      env as never,
      readConfig(env as never),
    );
    await services.pub.email.send({ ...MSG, siteId: null });
    const list = await outbox(app);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      to: "ana@example.com",
      subject: "Confirm your subscription",
      headers: MSG.headers,
    });
    const page = await call(app, "/dev/outbox");
    expect(await page.text()).toContain("Confirm your subscription");
    const one = (await (await call(app, `/dev/outbox/${list[0]?.id}`)).json()) as { html: string };
    expect(one.html).toBe("<p>Hi</p>");
    const body = await call(app, `/dev/outbox/${list[0]?.id}/html`);
    expect(body.headers.get("content-security-policy")).toContain("sandbox");
    expect((await call(app, "/dev/outbox", { method: "DELETE" })).status).toBe(200);
    expect(await outbox(app)).toHaveLength(0);
  });

  it("is not available outside DEV_MODE", async () => {
    const app = makePublicApp();
    const res = await call(app, "/dev/outbox", {}, { ...(env as object), DEV_MODE: "false" });
    expect(res.status).toBe(404);
  });
});
