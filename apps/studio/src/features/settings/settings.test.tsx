import { EditorView } from "@codemirror/view";
import { act, screen, waitFor, within } from "@testing-library/react";
import sodium from "libsodium-wrappers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useEditorUi } from "../editor/editor-store";
import type { EditorStore } from "../editor/model/store";
import { settingsTabFromPath } from "../site-mgmt/SiteManagementHost";
import { PLUGIN_COMMANDS } from "./ConnectAiSettings";
import { cloudflareTokenUrl, sealSecret } from "./sealedBox";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

const FORBIDDEN = /\b(repo|repository|repositories|commit\w*|branch\w*|build\w*|deploy\w*)\b/gi;
function visibleCopy(): string {
  let text = `${document.body.textContent ?? ""} `;
  for (const el of document.querySelectorAll("[aria-label],[placeholder],[title],[alt]"))
    for (const attr of ["aria-label", "placeholder", "title", "alt"]) {
      const v = el.getAttribute(attr);
      if (v) text += ` ${v}`;
    }
  return text;
}

const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();

async function openSettings(tab: string, site: Partial<Site> = {}) {
  const list = sites.map((s) => (s.id === willow.id ? { ...s, ...site } : s));
  const utils = renderStudio(`/sites/${willow.id}/settings/${tab}`, { user: SAM, sites: list });
  await screen.findByRole("region", { name: "Site settings" });
  return utils;
}

beforeAll(async () => {
  await sodium.ready;
});
beforeEach(() => useEditorUi.getState().reset());

describe("settings shell", () => {
  it("parses the settings route", () => {
    expect(settingsTabFromPath("/sites/st_1/settings")).toBeNull();
    expect(settingsTabFromPath("/sites/st_1/settings/domains")).toBe("domains");
    expect(settingsTabFromPath("/sites/st_1")).toBeUndefined();
  });

  it("opens from the rail, lists tabs by role, and closes back to the editor", async () => {
    const { user, router } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const nav = await screen.findByRole("navigation", { name: "Settings" });
    for (const name of [
      "General",
      "Your site's home",
      "Domain",
      "Connect your AI",
      "People",
      "Hosting",
      "Advanced",
      "Export",
      "Delete site",
    ])
      expect(within(nav).getByRole("button", { name })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close settings" }));
    expect(router.state.location.pathname).toBe(`/sites/${willow.id}`);
  });

  it("hides owner-only and designer-only tabs from editors", async () => {
    await openSettings("general", { role: "editor" });
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).queryByRole("button", { name: "Hosting" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Delete site" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Advanced" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Domain" })).toBeNull();
    expect(within(nav).getByRole("button", { name: "Connect your AI" })).toBeInTheDocument();
  });

  it("keeps Git vocabulary out of every tab except Advanced", async () => {
    const { user } = await openSettings("general");
    const nav = screen.getByRole("navigation", { name: "Settings" });
    for (const name of [
      "General",
      "Your site's home",
      "Domain",
      "Connect your AI",
      "People",
      "Hosting",
      "Export",
      "Delete site",
    ]) {
      await user.click(within(nav).getByRole("button", { name }));
      await screen.findByRole("heading", { level: 2, name });
      await act(() => new Promise((r) => setTimeout(r, 30)));
      expect(visibleCopy().match(FORBIDDEN), name).toBeNull();
    }
  });
});

describe("general", () => {
  it("saves name, tagline, language and title pattern as one site.update and renames the site", async () => {
    const { user, hub } = await openSettings("general");
    const name = screen.getByLabelText("Site name");
    await user.clear(name);
    await user.type(name, "Willow Yoga Collective");
    const tagline = screen.getByLabelText("Tagline");
    await user.clear(tagline);
    await user.type(tagline, "Slow classes for busy people");
    await user.type(screen.getByLabelText("Page title pattern"), "%s | Willow");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(hub.calls.some((c) => c.method === "renameSite")).toBe(true));
    const site = store().doc.site;
    expect(site.title).toBe("Willow Yoga Collective");
    expect(site.tagline).toBe("Slow classes for busy people");
    expect(site.seo?.titleTemplate).toBe("%s | Willow");
    expect(store().undoStack.at(-1)?.label).toBe("Site details");
    expect(hub.calls.find((c) => c.method === "renameSite")?.args).toEqual([
      willow.id,
      "Willow Yoga Collective",
    ]);
  });

  it("validates the title pattern", async () => {
    const { user } = await openSettings("general");
    await user.type(screen.getByLabelText("Page title pattern"), "Willow");
    expect(screen.getByText("Include %s where the page name goes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("your site's home", () => {
  it("explains where things live with links to the files, the live site and export", async () => {
    await openSettings("home");
    expect(screen.getByText(/your own GitHub account/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: new RegExp(`github.com/${willow.repo}`) }),
    ).toHaveAttribute("href", `https://github.com/${willow.repo}`);
    expect(screen.getByRole("button", { name: "Export your data" })).toBeInTheDocument();
    expect(screen.getByText("You can leave and keep everything")).toBeInTheDocument();
  });
});

describe("domains wizard", () => {
  it("detects the registrar, shows the records and polls DNS until HTTPS is on", async () => {
    const { user, hub } = await openSettings("domains");
    await user.type(await screen.findByLabelText("Domain"), "https://WillowYoga.test/");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Namecheap")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Namecheap/ })).toHaveAttribute(
      "href",
      expect.stringContaining("namecheap.com"),
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("185.199.108.153")).toBeInTheDocument();
    expect(within(table).getByText(`${SAM.login}.github.io`)).toBeInTheDocument();
    expect(within(table).getAllByText("Optional").length).toBe(4);

    await user.click(screen.getByRole("button", { name: /connect willowyoga\.test/ }));
    // Live checklist: waits, then www, then the main domain, then the certificate.
    expect(await screen.findByText("www.willowyoga.test points to GitHub")).toBeInTheDocument();
    await screen.findByText("Connected", undefined, { timeout: 3000 });
    expect(screen.getByText(/Secure and live/)).toBeInTheDocument();
    expect(screen.getByText(/www\.willowyoga\.test sends them there too/)).toBeInTheDocument();
    expect(hub.calls.filter((c) => c.method === "checkDomain").length).toBeGreaterThanOrEqual(3);
  });

  it("tells Cloudflare-hosted sites where to connect a domain", async () => {
    await openSettings("domains", { deployTarget: "cloudflare" });
    expect(await screen.findByText(/Your site is hosted on Cloudflare/)).toBeInTheDocument();
  });

  it("shows a plain error for an invalid domain", async () => {
    const { user } = await openSettings("domains");
    await user.type(await screen.findByLabelText("Domain"), "not a domain");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter a domain like mayayoga.com.")).toBeInTheDocument();
  });
});

describe("connect your AI", () => {
  it("makes a personal link, shows Claude and Claude Code steps, and manages app access", async () => {
    const { user, hub } = await openSettings("ai");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(await screen.findByRole("button", { name: "Make my link" }));
    const url = await waitFor(() => {
      const code = document.querySelector(".st-token code");
      expect(code?.textContent).toMatch(/^http:\/\/localhost:8787\/mcp\/u\//);
      return code?.textContent as string;
    });
    expect(writeText).toHaveBeenCalledWith(url);
    expect(screen.getByText("Settings → Connectors")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Claude Code" }));
    for (const cmd of PLUGIN_COMMANDS) expect(screen.getByText(cmd)).toBeInTheDocument();
    expect(
      screen.getByText(`claude mcp add --transport http openspace ${url}`),
    ).toBeInTheDocument();

    // Grants: allow publishing, then disconnect.
    await user.click(await screen.findByRole("switch", { name: "Claude can publish" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "setMcpGrantPublish")?.args).toEqual([
        "grant_claude",
        true,
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Disconnect Claude" }));
    expect(await screen.findByText("No apps connected yet")).toBeInTheDocument();

    // Turning a link off.
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    await user.click(screen.getByRole("button", { name: "Turn off link" }));
    await waitFor(() => expect(hub.calls.some((c) => c.method === "revokeMcpToken")).toBe(true));
  });
});

describe("people", () => {
  it("invites by email or GitHub username, changes roles and approves contributions", async () => {
    const { user, hub } = await openSettings("collaborators");
    await screen.findByText("Jordan Lee");
    const who = screen.getByLabelText("Email or GitHub username");
    await user.type(who, "alex@example.com");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "inviteCollaborator")?.args[1]).toEqual({
        email: "alex@example.com",
        role: "editor",
      }),
    );
    expect(await screen.findByText("alex@example.com")).toBeInTheDocument();
    expect(screen.getByText(/You can also send them this link/)).toBeInTheDocument();

    await user.type(who, "@rae-okafor");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(hub.calls.filter((c) => c.method === "inviteCollaborator").at(-1)?.args[1]).toEqual({
        login: "rae-okafor",
        role: "editor",
      }),
    );

    await user.click(screen.getByRole("combobox", { name: "Role for Jordan Lee" }));
    await user.click(await screen.findByRole("option", { name: "Designer" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "updateCollaborator")?.args).toEqual([
        willow.id,
        "gh_2002",
        { role: "designer" },
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "decideApproval")?.args).toEqual([
        willow.id,
        "apr_1",
        "approve",
        undefined,
      ]),
    );
    expect(await screen.findByText("Nothing to review")).toBeInTheDocument();
  });

  it("locks sections for one person", async () => {
    const { user, hub } = await openSettings("collaborators");
    await screen.findByText("Jordan Lee");
    await user.click(screen.getByRole("button", { name: "Locks" }));
    const dialog = await screen.findByRole("dialog", { name: /Lock sections for Jordan Lee/ });
    const boxes = within(dialog).getAllByRole("checkbox");
    await user.click(boxes[0] as HTMLElement);
    await user.click(within(dialog).getByRole("button", { name: "Save locks" }));
    await waitFor(() => {
      const call = hub.calls.find((c) => c.method === "updateCollaborator");
      expect(
        (call?.args[2] as { lockedSections?: string[] } | undefined)?.lockedSections,
      ).toHaveLength(1);
    });
  });
});

describe("hosting", () => {
  it("seals the Cloudflare token in the browser so the Hub only sees ciphertext", async () => {
    const pair = sodium.crypto_box_keypair();
    const { user, hub } = await openSettings("general");
    // The site's Actions key (in production, GitHub's actions/secrets/public-key).
    hub.manage.actionsKey = {
      keyId: "kid_1",
      key: sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL),
    };
    await user.click(screen.getByRole("button", { name: "Hosting" }));
    // Built at runtime: never a secret-shaped literal in the source.
    const token = ["cf", "test", "Z".repeat(36)].join("_");
    const account = "0123456789abcdef0123456789abcdef";
    expect(await screen.findByRole("link", { name: /Create token on Cloudflare/ })).toHaveAttribute(
      "href",
      cloudflareTokenUrl(willow.name),
    );
    await user.type(screen.getByLabelText("Access token"), token);
    await user.type(screen.getByLabelText("Account ID"), account);
    await user.click(screen.getByRole("button", { name: "Connect Cloudflare" }));
    await screen.findByText(/Almost there/);

    const put = hub.calls.find((c) => c.method === "putHostingSecrets");
    const secrets = put?.args[1] as Array<{ name: string; encryptedValue: string; keyId: string }>;
    expect(secrets.map((s) => s.name)).toEqual(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]);
    // Nothing the Hub received contains the token in the clear.
    expect(JSON.stringify(hub.calls)).not.toContain(token);
    expect(hub.calls.find((c) => c.method === "switchHosting")?.args).toEqual([
      willow.id,
      "cloudflare",
    ]);
    // Only the matching private key (GitHub's) can open them.
    const open = (name: string) => {
      const s = secrets.find((x) => x.name === name);
      return sodium.to_string(
        sodium.crypto_box_seal_open(
          sodium.from_base64(s?.encryptedValue ?? "", sodium.base64_variants.ORIGINAL),
          pair.publicKey,
          pair.privateKey,
        ),
      );
    };
    expect(open("CLOUDFLARE_API_TOKEN")).toBe(token);
    expect(open("CLOUDFLARE_ACCOUNT_ID")).toBe(account);
    expect(secrets.every((s) => s.keyId === "kid_1")).toBe(true);
  });

  it("round-trips a sealed box with the matching private key", async () => {
    const pair = sodium.crypto_box_keypair();
    const pub = sodium.to_base64(pair.publicKey, sodium.base64_variants.ORIGINAL);
    const secret = ["tok", "en", "abc"].join("-");
    const sealed = await sealSecret(pub, secret);
    expect(sealed).not.toContain(secret);
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL),
      pair.publicKey,
      pair.privateKey,
    );
    expect(sodium.to_string(opened)).toBe(secret);
    await expect(sealSecret("c2hvcnQ=", secret)).rejects.toThrow();
  });

  it("asks for a valid token and account ID", async () => {
    const { user } = await openSettings("hosting");
    await user.type(await screen.findByLabelText("Access token"), "nope");
    await user.type(screen.getByLabelText("Account ID"), "123");
    expect(screen.getByText("That doesn't look like a Cloudflare token.")).toBeInTheDocument();
    expect(screen.getByText("Account IDs are 32 letters and numbers.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Cloudflare" })).toBeDisabled();
  });
});

describe("advanced", () => {
  it("edits custom CSS with CodeMirror and saves it as a site.update", async () => {
    const { user } = await openSettings("advanced");
    const content = await screen.findByLabelText("Custom CSS", { selector: ".cm-content" });
    const view = EditorView.findFromDOM(content as HTMLElement);
    act(() => {
      view?.dispatch({ changes: { from: 0, insert: ".os-header { letter-spacing: 0.02em; }" } });
    });
    const card = screen.getByRole("region", { name: "Custom CSS" });
    await user.click(within(card).getByRole("button", { name: "Save" }));
    expect(store().doc.site.customCss).toBe(".os-header { letter-spacing: 0.02em; }");
    // Undo restores it, and the editor follows.
    act(() => {
      store().undo();
    });
    await waitFor(() => expect(view?.state.doc.toString()).toBe(store().doc.site.customCss ?? ""));
  });

  it("manages redirects with validation", async () => {
    const { user } = await openSettings("advanced");
    await user.type(await screen.findByLabelText("Old address"), "old-classes");
    await user.type(screen.getByLabelText("New address"), "/classes");
    await user.click(screen.getByRole("button", { name: "Add redirect" }));
    expect(store().doc.site.redirects).toContainEqual({
      from: "/old-classes",
      to: "/classes",
      status: 301,
    });
    await user.type(screen.getByLabelText("Old address"), "/old-classes");
    await user.type(screen.getByLabelText("New address"), "/elsewhere");
    expect(screen.getByRole("alert")).toHaveTextContent("/old-classes already redirects.");
    await user.click(screen.getByRole("button", { name: "Remove redirect from /old-classes" }));
    expect(store().doc.site.redirects).toBeUndefined();
  });

  it("creates a 404 page out of the navigation and opens it", async () => {
    const { user, router } = await openSettings("advanced");
    await user.click(await screen.findByRole("button", { name: "Create a 404 page" }));
    const page = Object.values(store().doc.pages).find((p) => p.slug === "404");
    expect(page?.seo?.noindex).toBe(true);
    expect(store().pageId).toBe(page?.id);
    expect(router.state.location.pathname).toBe(`/sites/${willow.id}`);
  });
});

describe("export and delete", () => {
  it("downloads CSV exports from the Hub", async () => {
    const create = vi.fn(() => "blob:mock");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user, hub } = await openSettings("export");
    const buttons = screen.getAllByRole("button", { name: "Download CSV" });
    await user.click(buttons[0] as HTMLElement);
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(hub.calls.find((c) => c.method === "downloadExport")?.args).toEqual([
      willow.id,
      "submissions",
    ]);
    expect(screen.getByRole("link", { name: /Download ZIP/ })).toHaveAttribute(
      "href",
      `https://github.com/${willow.repo}/archive/refs/heads/main.zip`,
    );
  });

  it("deletes the site only after typing its name", async () => {
    const { user, hub, router } = await openSettings("delete");
    const button = screen.getByRole("button", { name: "Delete this site" });
    expect(button).toBeDisabled();
    await user.type(screen.getByRole("textbox"), willow.name);
    await user.click(button);
    await waitFor(() => expect(router.state.location.pathname).toBe("/sites"));
    expect(hub.calls.find((c) => c.method === "deleteSite")?.args).toEqual([
      willow.id,
      willow.name,
    ]);
  });
});
