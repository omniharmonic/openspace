import { describe, expect, it } from "vitest";
import { siteFixture } from "./__fixtures__/site";
import { POPUP_TRIGGERS, PopupSchema, SiteSchema } from "./site";

const validSite = siteFixture().site;

const base = {
  enabled: true,
  trigger: "time" as const,
  delaySeconds: 8,
  frequencyDays: 7,
  heading: "Ten percent off your first class",
};

describe("Popup", () => {
  it("accepts each trigger with its setting", () => {
    expect(PopupSchema.safeParse(base).success).toBe(true);
    expect(
      PopupSchema.safeParse({
        ...base,
        trigger: "scroll",
        delaySeconds: undefined,
        scrollPercent: 50,
      }).success,
    ).toBe(true);
    expect(
      PopupSchema.safeParse({ ...base, trigger: "exit-intent", delaySeconds: undefined }).success,
    ).toBe(true);
    expect(POPUP_TRIGGERS).toEqual(["time", "scroll", "exit-intent"]);
  });

  it("requires the delay or scroll depth its trigger needs", () => {
    const noDelay = PopupSchema.safeParse({ ...base, delaySeconds: undefined });
    expect(noDelay.success).toBe(false);
    expect(noDelay.error?.issues[0]?.path).toEqual(["delaySeconds"]);
    const noScroll = PopupSchema.safeParse({ ...base, trigger: "scroll" });
    expect(noScroll.success).toBe(false);
    expect(noScroll.error?.issues[0]?.path).toEqual(["scrollPercent"]);
  });

  it("accepts full content: body, image, button, newsletter and theme", () => {
    const full = {
      ...base,
      body: "Join the Saturday flow and bring a friend.",
      image: { src: "media/2026/10/studio-k3f9a2b1.jpg", alt: "The studio at dawn" },
      cta: { label: "See the schedule", link: { type: "url", url: "/schedule" } },
      newsletter: true,
      colorTheme: "dark-accent",
    };
    expect(PopupSchema.safeParse(full).success).toBe(true);
  });

  it("rejects out-of-range values and unknown keys", () => {
    expect(PopupSchema.safeParse({ ...base, frequencyDays: -1 }).success).toBe(false);
    expect(PopupSchema.safeParse({ ...base, frequencyDays: 400 }).success).toBe(false);
    expect(PopupSchema.safeParse({ ...base, delaySeconds: 601 }).success).toBe(false);
    expect(PopupSchema.safeParse({ ...base, trigger: "scroll", scrollPercent: 2 }).success).toBe(
      false,
    );
    expect(PopupSchema.safeParse({ ...base, heading: "" }).success).toBe(false);
    expect(PopupSchema.safeParse({ ...base, html: "<script>" }).success).toBe(false);
    expect(PopupSchema.safeParse({ ...base, trigger: "load" }).success).toBe(false);
  });

  it("is optional and nullable on the site", () => {
    expect(SiteSchema.safeParse(validSite).success).toBe(true);
    expect(SiteSchema.safeParse({ ...validSite, popup: null }).success).toBe(true);
    expect(SiteSchema.safeParse({ ...validSite, popup: base }).success).toBe(true);
    expect(SiteSchema.safeParse({ ...validSite, popup: { ...base, heading: "" } }).success).toBe(
      false,
    );
  });
});
