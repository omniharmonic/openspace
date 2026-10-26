import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, IconButton, Popover, toast } from "../ui";
import { isStandalone, promptInstall, usePwa } from "./register";

const IOS_DISMISSED = "openspace.installHint";
const OFFLINE_TOLD = "openspace.offlineReady";

function isIosSafari(nav: Navigator | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the hint may show again next time.
  }
}

/**
 * "Install" in the app header: the browser's own install dialog where it offers one, and on
 * iPhone/iPad (which has no prompt) a short how-to. Hidden once installed.
 */
export function InstallButton({ compact = false }: { compact?: boolean }) {
  const event = usePwa((s) => s.installEvent);
  const installed = usePwa((s) => s.installed);
  const [hintGone, setHintGone] = useState(() => read(IOS_DISMISSED) === "1");
  if (installed || isStandalone()) return null;
  if (event)
    return compact ? (
      <IconButton
        label="Install OpenSpace on this device"
        icon={<Download />}
        onClick={() => void promptInstall()}
      />
    ) : (
      <Button size="sm" variant="ghost" icon={<Download />} onClick={() => void promptInstall()}>
        Install
      </Button>
    );
  if (!isIosSafari() || hintGone) return null;
  return (
    <Popover
      trigger={<IconButton label="Add OpenSpace to your Home Screen" icon={<Download />} />}
      align="end"
    >
      <div className="st-install-hint">
        <p>
          Tap <Share aria-label="Share" className="st-install-hint__icon" /> Share, then{" "}
          <strong>Add to Home Screen</strong>. OpenSpace then opens like an app and works offline.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            write(IOS_DISMISSED, "1");
            setHintGone(true);
          }}
        >
          Don’t show again
        </Button>
      </div>
    </Popover>
  );
}

/** Toasts for the service worker: "works offline now" (once) and "new version ready". */
export function PwaNotices() {
  const offlineReady = usePwa((s) => s.offlineReady);
  const needRefresh = usePwa((s) => s.needRefresh);
  const otherTabs = usePwa((s) => s.otherTabs);
  useEffect(() => {
    if (!offlineReady || read(OFFLINE_TOLD) === "1") return;
    write(OFFLINE_TOLD, "1");
    toast({
      id: "pwa-offline-ready",
      title: "OpenSpace works offline now",
      description: "Your drafts are kept on this device and sync when you’re back online.",
    });
  }, [offlineReady]);
  useEffect(() => {
    if (!needRefresh) return;
    toast({
      id: "pwa-update",
      title: "A new version of OpenSpace is ready",
      description: "It starts the next time you open OpenSpace, or reload now.",
      duration: Number.POSITIVE_INFINITY,
      action: { label: "Reload", onClick: () => void usePwa.getState().update?.() },
    });
  }, [needRefresh]);
  useEffect(() => {
    if (!otherTabs) return;
    toast({
      id: "pwa-update",
      title: "Close your other OpenSpace tabs to update",
      description: "The new version starts once this is the only OpenSpace tab open.",
      duration: Number.POSITIVE_INFINITY,
      action: { label: "Try again", onClick: () => void usePwa.getState().update?.() },
    });
  }, [otherTabs]);
  return null;
}
