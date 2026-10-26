import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorUi } from "../editor/editor-store";
import { FORBIDDEN, openWorkspace, visibleCopy, WILLOW } from "../workspace/testing";

// The editor and workspace screens load on demand; the first test in a busy run can be slow.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => useEditorUi.getState().reset());

type GrowthState = {
  campaigns: Array<{
    id: string;
    subject: string;
    status: string;
    body: { blocks: Array<{ type: string }> };
    segment: unknown;
  }>;
  senders: Array<{ id: string; status: string; provider: string }>;
  outbox: Array<{ to: string; subject: string; kind: string }>;
};
const growth = (hub: { growth: { sites: Record<string, unknown> } }) =>
  hub.growth.sites[WILLOW.id] as GrowthState;

const frame = () => screen.getByTitle(/^Email preview/) as HTMLIFrameElement;

describe("email campaigns", () => {
  it("lists sent and draft emails, with stats for sent ones", async () => {
    const { user } = await openWorkspace("campaigns");
    const list = await screen.findByRole("list", { name: "Emails" });
    expect(within(list).getByText("October at Willow Street")).toBeInTheDocument();
    expect(within(list).getByText("Winter retreat: early places")).toBeInTheDocument();
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
    await user.click(within(list).getByText("October at Willow Street"));
    expect(await screen.findByText("Clicked a link")).toBeInTheDocument();
    expect(screen.getByText("Not counted (privacy first)")).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "https://willowstreetyoga.com/classes" }),
    ).toBeInTheDocument();
  });

  it("writes an email with blocks, previews it on desktop, phone and dark, and autosaves", async () => {
    const { user, hub, router } = await openWorkspace("campaigns/new");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/campaigns\/cmp_/));
    const subject = await screen.findByRole("textbox", { name: "Subject" });
    expect(subject).toHaveValue("News from Willow Street Yoga");
    await user.clear(subject);
    await user.type(subject, "Spring timetable");
    await user.type(screen.getByRole("textbox", { name: "Preview text" }), "Three new classes");
    // The starter blocks render through email-render.
    await waitFor(() =>
      expect(frame().getAttribute("srcdoc")).toContain("News from Willow Street Yoga"),
    );
    expect(
      screen.getByText("Spring timetable", {
        selector: ".st-email-preview__inbox span, .st-email-preview__inbox span *",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Dark mode" }));
    expect(frame().getAttribute("srcdoc")).not.toMatch(/prefers-color-scheme:\s*dark/);
    expect(frame().getAttribute("srcdoc")).toContain('content="dark"');
    await user.click(screen.getByRole("radio", { name: "Phone" }));
    expect(frame().closest(".st-email-preview__stage")?.className).toContain("is-mobile");
    // Add an email-safe block.
    await user.click(
      screen.getAllByRole("button", { name: "Add a block here" }).at(-1) as HTMLElement,
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: "Gallery" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Button" }));
    await waitFor(
      () => {
        const c = growth(hub).campaigns.find((x) => x.subject === "Spring timetable");
        expect(c?.body.blocks.map((b) => b.type)).toEqual(["heading", "text", "button"]);
      },
      { timeout: 3000 },
    );
  });

  it("saves an everyone campaign with an empty segment, clears preview text to null, and flags an empty subject", async () => {
    const { user, hub } = await openWorkspace("campaigns/cmp_retreat");
    await screen.findByRole("textbox", { name: "Subject" });
    const update = vi.spyOn(hub, "updateCampaign");
    // Remove the only tag: the email goes to everyone.
    await user.click(screen.getByRole("button", { name: "Remove retreats" }));
    await user.type(screen.getByRole("textbox", { name: "Preview text" }), "x");
    await waitFor(() => expect(update).toHaveBeenCalled(), { timeout: 3000 });
    await user.clear(screen.getByRole("textbox", { name: "Preview text" }));
    await waitFor(
      () => {
        const last = update.mock.calls.at(-1)?.[2];
        expect(last?.segment).toEqual({ tags: [], match: "any" });
        expect(last?.preheader).toBeNull();
      },
      { timeout: 3000 },
    );
    const c = growth(hub).campaigns.find((x) => x.id === "cmp_retreat") as unknown as {
      segment: unknown;
      preheader: unknown;
    };
    expect(c.segment).toEqual({ tags: [], match: "any" });
    expect(c.preheader).toBeNull();
    expect(screen.getByText(/All subscribers: \d+ people/)).toBeInTheDocument();
    // The Hub refuses an empty subject; the composer says so instead of failing silently.
    await user.clear(screen.getByRole("textbox", { name: "Subject" }));
    expect(
      await screen.findByText(/Not saved: Give the email a subject\./, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("targets a tag, sends a test and sends to the segment", async () => {
    const { user, hub } = await openWorkspace("campaigns/cmp_retreat");
    expect(await screen.findByText(/Subscribers tagged retreats: 8 people/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send a test" }));
    await user.type(
      await screen.findByRole("textbox", { name: "Test address" }),
      "sam@example.com",
    );
    await user.click(screen.getByRole("button", { name: "Send test" }));
    await waitFor(() =>
      expect(growth(hub).outbox).toContainEqual({
        to: "sam@example.com",
        subject: "[Test] Winter retreat: early places",
        kind: "campaign-test",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Send now" }));
    const confirm = await screen.findByRole("dialog", { name: "Send to 8 people?" });
    await user.click(within(confirm).getByRole("button", { name: "Send now" }));
    await waitFor(() =>
      expect(growth(hub).campaigns.find((c) => c.id === "cmp_retreat")?.status).toBe("sent"),
    );
    expect(growth(hub).outbox.filter((m) => m.kind === "campaign")).toHaveLength(8);
    expect(await screen.findByText("Delivered")).toBeInTheDocument();
  });

  it("schedules an email and unschedules it to edit", async () => {
    const { user, hub } = await openWorkspace("campaigns/cmp_retreat");
    await screen.findByRole("textbox", { name: "Subject" });
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule this email" });
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() =>
      expect(growth(hub).campaigns.find((c) => c.id === "cmp_retreat")?.status).toBe("scheduled"),
    );
    await user.click(await screen.findByRole("button", { name: "Unschedule to edit" }));
    await waitFor(() =>
      expect(growth(hub).campaigns.find((c) => c.id === "cmp_retreat")?.status).toBe("draft"),
    );
  });

  it("explains when there's no sender and links to sending setup", async () => {
    const { user, hub, router } = await openWorkspace("campaigns/cmp_retreat");
    await screen.findByRole("textbox", { name: "Subject" });
    growth(hub).senders.length = 0;
    await user.click(screen.getByRole("button", { name: "Send now" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Send now" }),
    );
    expect(await screen.findByText("Connect an email sender before sending.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set up sending" }));
    expect(router.state.location.pathname).toBe(`/sites/${WILLOW.id}/campaigns/sender`);
  });

  it("only lets designers send; editors write and test", async () => {
    await openWorkspace("campaigns/cmp_retreat", { site: { role: "editor" } });
    await screen.findByRole("textbox", { name: "Subject" });
    expect(screen.queryByRole("button", { name: "Send now" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send a test" })).toBeInTheDocument();
  });
});

describe("sending setup", () => {
  it("connects a provider, shows the bounce address once and checks DNS records", async () => {
    const { user, hub } = await openWorkspace("campaigns/sender");
    await user.click(await screen.findByRole("button", { name: "Connect a provider" }));
    await user.click(screen.getByRole("button", { name: /Resend/ }));
    await user.type(
      screen.getByRole("textbox", { name: "Send from" }),
      "news@willowstreetyoga.com",
    );
    await user.type(screen.getByRole("textbox", { name: "From name" }), "Willow Street Yoga");
    // Built at runtime so no secret-shaped literal lands in the repo.
    const key = ["re", "test", "abc123def456"].join("_");
    await user.type(screen.getByLabelText("API key"), key);
    const hook = ["whsec", "abcdefgh12345678"].join("_");
    await user.type(screen.getByLabelText("Webhook signing secret (optional)"), hook);
    const create = vi.spyOn(hub, "createSender");
    await user.click(screen.getByRole("button", { name: "Connect Resend" }));
    expect(await screen.findByText(/It's shown only once/)).toBeInTheDocument();
    // The Svix secret is a top-level field in the Hub's contract, not a credential.
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      provider: "resend",
      credentials: { apiKey: key },
      webhookSecret: hook,
    });
    expect(screen.getByText(/\/e\/webhooks\/resend\//)).toBeInTheDocument();
    const call = hub.calls.find((c) => c.method === "createSender");
    expect(JSON.stringify(call?.args)).not.toContain(key);
    await user.click(screen.getByRole("button", { name: "Done" }));
    const card = await screen.findByRole("region", { name: "Sender news@willowstreetyoga.com" });
    expect(within(card).getByText("Not checked yet")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Check records" }));
    expect(await within(card).findByText("Needs DNS records")).toBeInTheDocument();
    expect(within(card).getByText("Sending permission (SPF)")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Check records" }));
    expect(await within(card).findByText("Ready to send")).toBeInTheDocument();
    expect(
      growth(hub).senders.some((s) => s.provider === "resend" && s.status === "verified"),
    ).toBe(true);
  });
});
