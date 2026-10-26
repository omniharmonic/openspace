import { h, siteInfo } from "./shared";

/**
 * Site search: a trigger (`data-os-behavior="search"`) opens a dialog and lazy-loads the
 * Pagefind UI generated at build time (`<base>/pagefind/`). Press "/" to open.
 */
let dialog: HTMLDialogElement | undefined;
let loading: Promise<void> | undefined;

function load(base: string, mount: HTMLElement): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    document.head.append(
      h("link", { rel: "stylesheet", href: `${base}/pagefind/pagefind-ui.css` }),
    );
    const s = h("script", { src: `${base}/pagefind/pagefind-ui.js` });
    s.onload = () => {
      const UI = (window as unknown as { PagefindUI?: new (o: object) => unknown }).PagefindUI;
      if (UI) new UI({ element: mount, showSubResults: true, autofocus: true });
      resolve();
    };
    s.onerror = () => {
      mount.textContent = "Search is not available right now.";
      reject(new Error("pagefind failed to load"));
    };
    document.head.append(s);
  });
  return loading;
}

export default function search(trigger: HTMLElement): void {
  const { base } = siteInfo();
  const open = () => {
    if (!dialog) {
      const mount = h("div", { class: "os-search__mount" });
      dialog = h("dialog", { class: "os-search", "aria-label": "Search this site" }, mount);
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog?.close();
      });
      document.body.append(dialog);
      load(base, mount).catch(() => {});
    }
    dialog.showModal();
    dialog.querySelector("input")?.focus();
  };
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
      e.preventDefault();
      open();
    }
  });
}
