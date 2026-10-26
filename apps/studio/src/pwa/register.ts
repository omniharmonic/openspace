import { create } from "zustand";

/**
 * The installable, offline Studio (PRD §5.1): service worker registration, "new version"
 * handling and the browser's install prompt, as a small store the UI reads.
 *
 * Updates apply on reload: when a new version has been downloaded, Studio says so (with a
 * Reload button), and if the person simply reloads or leaves, the waiting version takes over
 * for the next load. A running editor is never reloaded underneath someone.
 */

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
}

export const usePwa = create<PwaState>(() => ({
  offlineReady: false,
  needRefresh: false,
  installEvent: null,
  installed: false,
  update: null,
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
    const update = registerSW({
      immediate: true,
      onNeedRefresh: () => usePwa.setState({ needRefresh: true }),
      onOfflineReady: () => usePwa.setState({ offlineReady: true }),
    });
    usePwa.setState({ update: () => update(true) });
    // Update on reload: a waiting version takes over as this page goes away.
    window.addEventListener("pagehide", () => {
      if (usePwa.getState().needRefresh) void update(false);
    });
  });
  return true;
}
