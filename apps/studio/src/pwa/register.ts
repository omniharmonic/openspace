import { create } from "zustand";

/**
 * The installable, offline Studio (PRD §5.1): service worker registration, "new version"
 * handling and the browser's install prompt, as a small store the UI reads.
 *
 * Updates apply on reload: when a new version has been downloaded, Studio says so (with a
 * Reload button), and if the person simply reloads or leaves, the waiting version takes over
 * for the next load. A running editor is never reloaded underneath someone, and the new
 * version never takes over while another Studio tab is still open (that tab would lose the
 * code it loads lazily): it waits until the last tab goes.
 */

/** Minimal BroadcastChannel surface (injectable for tests). */
export interface TabChannel {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  close(): void;
}

type PresenceMessage = { type: "hello" | "here" | "bye"; id: string };

/**
 * Which other Studio tabs are open, over a BroadcastChannel: each tab says hello on start,
 * answers hellos, repeats "here" every {@link HEARTBEAT_MS}, and says bye when it goes. A tab
 * that crashed without saying bye is forgotten after {@link STALE_MS}.
 */
export const HEARTBEAT_MS = 10_000;
export const STALE_MS = 25_000;

export class TabPresence {
  private readonly others = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly channel: TabChannel | null,
    readonly id = `tab-${Math.random().toString(36).slice(2, 10)}`,
    private readonly now: () => number = Date.now,
  ) {
    channel?.addEventListener("message", (e) => {
      const m = e.data as PresenceMessage;
      if (!m || m.id === this.id) return;
      if (m.type === "bye") this.others.delete(m.id);
      else this.others.set(m.id, this.now());
      if (m.type === "hello") this.post("here");
    });
  }

  private post(type: PresenceMessage["type"]) {
    this.channel?.postMessage({ type, id: this.id } satisfies PresenceMessage);
  }

  start() {
    this.post("hello");
    this.timer = setInterval(() => this.post("here"), HEARTBEAT_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.post("bye");
  }

  /** No other Studio tab is open (as far as this tab knows). */
  alone(): boolean {
    const t = this.now();
    for (const [id, seen] of this.others) if (t - seen > STALE_MS) this.others.delete(id);
    return this.others.size === 0;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** The service worker is installed and the app shell is cached (opens offline). */
  offlineReady: boolean;
  /** A new version is waiting. */
  needRefresh: boolean;
  /** The browser offered installation (Chromium's `beforeinstallprompt`). */
  installEvent: BeforeInstallPromptEvent | null;
  /** Running as an installed app. */
  installed: boolean;
  /** Activate the waiting version (and reload). */
  update: (() => Promise<void>) | null;
  /** The update is waiting for other Studio tabs to close. */
  otherTabs: boolean;
}

export const usePwa = create<PwaState>(() => ({
  offlineReady: false,
  needRefresh: false,
  installEvent: null,
  installed: false,
  update: null,
  otherTabs: false,
}));

export interface RegisterEnv {
  MODE: string;
  DEV: boolean;
}

/** Whether this environment should run the service worker (never in tests or dev). */
export function shouldRegister(
  env: RegisterEnv,
  nav: Pick<Navigator, "serviceWorker"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): boolean {
  if (env.MODE === "test" || env.DEV) return false;
  return Boolean(nav && "serviceWorker" in nav && nav.serviceWorker);
}

export function isStandalone(win: Window | undefined = globalThis.window): boolean {
  if (!win) return false;
  return (
    Boolean(win.matchMedia?.("(display-mode: standalone)").matches) ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Listen for the browser's install offer (call once at startup; harmless in tests). */
export function listenForInstall(win: Window | undefined = globalThis.window): () => void {
  if (!win) return () => {};
  usePwa.setState({ installed: isStandalone(win) });
  const onPrompt = (e: Event) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  };
  const onInstalled = () => usePwa.setState({ installEvent: null, installed: true });
  win.addEventListener("beforeinstallprompt", onPrompt);
  win.addEventListener("appinstalled", onInstalled);
  return () => {
    win.removeEventListener("beforeinstallprompt", onPrompt);
    win.removeEventListener("appinstalled", onInstalled);
  };
}

/** Show the browser's install dialog. Resolves true when the person installed Studio. */
export async function promptInstall(): Promise<boolean> {
  const e = usePwa.getState().installEvent;
  if (!e) return false;
  await e.prompt();
  const choice = await e.userChoice;
  usePwa.setState({ installEvent: null, installed: choice.outcome === "accepted" });
  return choice.outcome === "accepted";
}

/**
 * Register the service worker (production builds only). Returns whether it was attempted.
 * Guarded so tests and the dev server never install a worker.
 */
export function registerServiceWorker(env: RegisterEnv = import.meta.env): boolean {
  if (!shouldRegister(env)) return false;
  void import("virtual:pwa-register").then(({ registerSW }) => {
    const presence = new TabPresence(
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("openspace-studio-tabs"),
    );
    presence.start();
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
      onOfflineReady: () => usePwa.setState({ offlineReady: true }),
    });
    usePwa.setState({
      update: async () => {
        if (presence.alone()) return update(true);
        usePwa.setState({ otherTabs: true });
      },
    });
    // Update on reload: a waiting version takes over as the last Studio tab goes away.
    window.addEventListener("pagehide", () => {
      presence.stop();
      if (usePwa.getState().needRefresh && presence.alone()) void update(false);
    });
  });
  return true;
}
