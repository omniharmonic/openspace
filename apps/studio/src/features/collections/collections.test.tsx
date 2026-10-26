import type { CollectionItem } from "@openspace/schema";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorUi } from "../editor/editor-store";
import { editorStore, FORBIDDEN, openWorkspace, visibleCopy, WILLOW } from "../workspace/testing";

// The editor and workspace screens load on demand; the first test in a busy run can be slow.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => useEditorUi.getState().reset());

const item = (collection: string, slug: string) =>
  editorStore().doc.collections[collection]?.[slug] as CollectionItem | undefined;

describe("collections", () => {
  it("lists posts with status filters and search, and opens from the rail", async () => {
    const { user, router } = await openWorkspace("content/journal");
    const list = await screen.findByRole("list", { name: "Journal" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    await user.click(screen.getByRole("radio", { name: /Drafts 2/ }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("radio", { name: /All 4/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search journal" }), "mornings");
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
    await user.click(
      screen.getAllByRole("button", { name: "Back to the editor" })[0] as HTMLElement,
    );
    expect(router.state.location.pathname).toBe(`/sites/${WILLOW.id}`);
    await user.click(await screen.findByRole("button", { name: "Content" }));
    await screen.findByRole("list", { name: "Journal" });
  });

  it("writes a new post, saves a draft as a Markdoc body, then publishes it", async () => {
    const { user, router } = await openWorkspace("content/journal/new");
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Our new teachers");
    // An address follows the title until it's edited by hand.
    expect(screen.getByDisplayValue("our-new-teachers")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a block" }));
    await user.click(await screen.findByRole("menuitem", { name: "Button" }));
    await user.clear(screen.getByRole("textbox", { name: "Label" }));
    await user.type(screen.getByRole("textbox", { name: "Label" }), "Meet them");
    await user.clear(screen.getByRole("textbox", { name: "Link" }));
    await user.type(
      screen.getByRole("textbox", { name: "Link" }),
      "https://willow.example/teachers",
    );
    await user.type(screen.getByRole("combobox", { name: "Author" }), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(item("journal", "our-new-teachers")).toBeDefined());
    const saved = item("journal", "our-new-teachers");
    expect(saved?.frontmatter).toMatchObject({
      title: "Our new teachers",
      status: "draft",
      author: "Sam Rivera",
    });
    expect(saved?.body).toContain('{% button label="Meet them"');
    expect(saved?.body).toContain('"url":"https://willow.example/teachers"');
    expect(router.state.location.pathname).toBe(
      `/sites/${WILLOW.id}/content/journal/our-new-teachers`,
    );
    // Publish.
    await user.click(screen.getByRole("radio", { name: "Published" }));
    await user.click(screen.getByRole("button", { name: "Publish post" }));
    await waitFor(() =>
      expect(item("journal", "our-new-teachers")?.frontmatter.status).toBe("published"),
    );
    // Undo goes through the editor history.
    act(() => {
      editorStore().undo();
    });
    expect(item("journal", "our-new-teachers")?.frontmatter.status).toBe("draft");
  });

  it("schedules a post only with a date, and explains what's missing", async () => {
    const { user } = await openWorkspace("content/journal/teacher-notes");
    await screen.findByDisplayValue("Notes from teacher training");
    await user.click(screen.getByRole("radio", { name: "Scheduled" }));
    const when = screen.getByLabelText("Goes live");
    await user.clear(when);
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(await screen.findByText(/Fix these before saving/)).toBeInTheDocument();
    expect(screen.getAllByText(/Pick when it should go live/).length).toBeGreaterThan(0);
    await user.type(when, "2026-12-01T09:30");
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() =>
      expect(item("journal", "teacher-notes")?.frontmatter.status).toBe("scheduled"),
    );
    expect(item("journal", "teacher-notes")?.frontmatter.publishAt).toMatch(
      /^2026-12-01T09:30:00[+-]\d{2}:\d{2}$/,
    );
  });

  it("sets an event's repeat rule, place and RSVP link", async () => {
    const { user } = await openWorkspace("content/events/community-open-house");
    await screen.findByDisplayValue("Community open house");
    await user.click(screen.getByRole("switch", { name: /Repeating event/ }));
    // Pick a weekday other than the event's own day (that one is always included).
    const extra = screen
      .getAllByRole("button", { pressed: false })
      .find((b) => /day$/.test(b.getAttribute("aria-label") ?? "")) as HTMLElement;
    await user.click(extra);
    await user.type(
      screen.getByRole("textbox", { name: "RSVP or ticket link" }),
      "https://willow.example/rsvp",
    );
    await user.click(screen.getByRole("button", { name: "Update event" }));
    await waitFor(() =>
      expect(item("events", "community-open-house")?.frontmatter).toMatchObject({
        registrationUrl: "https://willow.example/rsvp",
      }),
    );
    const fm = item("events", "community-open-house")?.frontmatter as { recurrence?: string };
    expect(fm.recurrence).toMatch(/^FREQ=WEEKLY;BYDAY=\w\w,\w\w$/);
    expect(screen.getByText(/^Next:/)).toBeInTheDocument();
  });

  it("never rewrites a repeat rule just by opening it, and moves a weekly day with the start date", async () => {
    const { user, router } = await openWorkspace("content/events");
    await screen.findByRole("list", { name: "Events" });
    const base = item("events", "community-open-house") as CollectionItem;
    const withRule = (slug: string, start: string, recurrence: string) =>
      ({
        ...base,
        slug,
        frontmatter: { ...base.frontmatter, title: slug, start, allDay: true, recurrence },
      }) as CollectionItem;
    act(() => {
      editorStore().commit([
        {
          op: "collection.upsert",
          collection: "events",
          item: withRule("last-tuesdays", "2026-11-24", "FREQ=MONTHLY;BYDAY=-1TU;WKST=SU"),
        } as never,
        {
          op: "collection.upsert",
          collection: "events",
          item: withRule("tuesdays", "2026-11-03", "FREQ=WEEKLY;BYDAY=TU;COUNT=8"),
        } as never,
      ]);
    });
    await act(() => router.navigate(`/sites/${WILLOW.id}/content/events/last-tuesdays`));
    expect(await screen.findByDisplayValue("FREQ=MONTHLY;BYDAY=-1TU;WKST=SU")).toBeInTheDocument();
    expect(screen.getByText("A custom repeat rule")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    // A change made elsewhere (undo, a collaborator) shows up in the text box.
    act(() => {
      const it = item("events", "last-tuesdays") as CollectionItem;
      editorStore().commit([
        {
          op: "collection.upsert",
          collection: "events",
          item: {
            ...it,
            frontmatter: { ...it.frontmatter, recurrence: "FREQ=MONTHLY;BYDAY=-1WE" },
          },
        } as never,
      ]);
    });
    expect(await screen.findByDisplayValue("FREQ=MONTHLY;BYDAY=-1WE")).toBeInTheDocument();

    await act(() => router.navigate(`/sites/${WILLOW.id}/content/events/tuesdays`));
    const starts = await screen.findByLabelText("Starts");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    // Typing through intermediate dates doesn't touch the rule; it follows on commit (blur).
    fireEvent.focus(starts);
    fireEvent.change(starts, { target: { value: "2026-11-01" } });
    fireEvent.change(starts, { target: { value: "2026-11-04" } }); // a Wednesday
    expect(screen.getByText(/Every week on Tuesday/)).toBeInTheDocument();
    fireEvent.blur(starts);
    expect(await screen.findByText(/Every week on Wednesday/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update event" }));
    await waitFor(() => {
      const fm = (item("events", "tuesdays") as CollectionItem).frontmatter as {
        recurrence?: string;
      };
      expect(fm.recurrence).toBe("FREQ=WEEKLY;BYDAY=WE;COUNT=8");
    });
  });

  it("gives products options, variants with their own price and stock", async () => {
    const { user, hub } = await openWorkspace("content/shop/cork-block");
    await screen.findByDisplayValue("Cork yoga block");
    const values = screen.getByRole("textbox", { name: "Option 1 values" });
    await user.type(values, "Travel{Enter}");
    const variants = await screen.findByText(/Variants \(3\)/);
    expect(variants).toBeInTheDocument();
    // Stock comes from the Hub's inventory.
    expect(await screen.findByText("14 in stock")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update product" }));
    await waitFor(() => {
      const fm = item("shop", "cork-block")?.frontmatter as {
        variants?: Array<{ sku?: string; options: Record<string, string> }>;
      };
      expect(fm.variants?.map((v) => v.options.Size)).toEqual(["Standard", "Wide", "Travel"]);
      expect(fm.variants?.[2]?.sku).toBe("BLOCK-TRAVEL");
    });
    expect(hub.calls.some((c) => c.method === "listProducts")).toBe(true);
  });

  it("won't save an episode without audio", async () => {
    const { user } = await openWorkspace("content/podcast/new");
    await screen.findByRole("textbox", { name: "Title" });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      (await screen.findAllByText(/Add the episode's audio file or link/)).length,
    ).toBeGreaterThan(0);
    expect(Object.keys(editorStore().doc.collections.podcast ?? {})).toEqual([
      "breath-as-an-anchor",
    ]);
  });

  it("changes collection settings and adds a new collection", async () => {
    const { user, router } = await openWorkspace("content/journal");
    await user.click(await screen.findByRole("button", { name: "Journal settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Journal settings" });
    const name = within(dialog).getByRole("textbox", { name: "Collection name" });
    await user.clear(name);
    await user.type(name, "Notebook");
    await user.click(within(dialog).getByRole("switch", { name: "Show the author" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(editorStore().doc.collectionConfigs?.journal?.label).toBe("Notebook"),
    );
    expect(editorStore().doc.collectionConfigs?.journal?.itemPage?.showAuthor).toBe(false);

    await user.click(screen.getByRole("button", { name: "Add a collection" }));
    await user.click(await screen.findByRole("button", { name: /Portfolio/ }));
    await user.click(screen.getByRole("button", { name: "Add Portfolio" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/sites/${WILLOW.id}/content/work`),
    );
    expect(editorStore().doc.collectionConfigs?.work?.kind).toBe("portfolio");
    expect(await screen.findByText("Add your first project")).toBeInTheDocument();
  });

  it("shows a live preview of the item page the site will publish", async () => {
    const { user } = await openWorkspace("content/journal/slow-mornings");
    await screen.findByDisplayValue("Why we start slow in the mornings");
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Preview on a computer" }));
    const frame = (await screen.findByTitle(/Preview of/)) as HTMLIFrameElement;
    await waitFor(() =>
      expect(frame.contentDocument?.body.textContent).toContain(
        "Why we start slow in the mornings",
      ),
    );
    expect(frame.contentDocument?.body.textContent).toContain(
      "You can't rush your way into stillness.",
    );
  });
});

describe("contributors and approvals", () => {
  it("lets a contributor submit a draft for review, then an editor approves it", async () => {
    const contributor = await openWorkspace("content/journal/new", {
      site: { role: "contributor" },
    });
    const { user, hub } = contributor;
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Guest post");
    expect(screen.queryByRole("radio", { name: "Published" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(hub.manage.approvals[WILLOW.id]?.some((a) => a.slug === "guest-post")).toBe(true),
    );
    expect(await screen.findByText("Sent for review")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "My submissions" }));
    expect(await screen.findByText("Guest post")).toBeInTheDocument();
  });

  it("reviews what changed and approves with the reviewed version", async () => {
    const { user, hub } = await openWorkspace("approvals");
    const decide = vi.spyOn(hub, "decideApproval");
    expect(
      await screen.findByRole("heading", { name: "Spring retreat recap" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Body changes" }).textContent).toContain(
      "Twelve of us",
    );
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(item("journal", "spring-retreat-recap")?.frontmatter.status).toBe("published"),
    );
    expect(decide).toHaveBeenCalledWith(
      WILLOW.id,
      "apr_1",
      "approve",
      undefined,
      expect.any(String),
    );
    expect(await screen.findByText("Nothing waiting for review")).toBeInTheDocument();
  });

  it("refuses an approval when the draft changed after review", async () => {
    const { user } = await openWorkspace("approvals");
    await screen.findByRole("heading", { name: "Spring retreat recap" });
    // Someone edits the draft while it's being reviewed.
    act(() => {
      const it = item("journal", "spring-retreat-recap") as CollectionItem;
      editorStore().commit([
        {
          op: "collection.upsert",
          collection: "journal",
          item: { ...it, frontmatter: { ...it.frontmatter, title: "Spring recap (edited)" } },
        } as never,
      ]);
    });
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("It changed while you were reviewing")).toBeInTheDocument();
  });

  it("sends a submission back with a note", async () => {
    const { user, hub } = await openWorkspace("approvals");
    await screen.findByRole("heading", { name: "Spring retreat recap" });
    await user.click(screen.getByRole("button", { name: "Send back" }));
    const dialog = await screen.findByRole("dialog", { name: "Send it back with a note" });
    await user.type(within(dialog).getByRole("textbox", { name: "Note" }), "Add a photo please");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    await waitFor(() =>
      expect(hub.manage.approvals[WILLOW.id]?.[0]).toMatchObject({
        status: "rejected",
        note: "Add a photo please",
      }),
    );
  });
});
