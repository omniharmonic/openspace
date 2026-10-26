import { h, load, save } from "./shared";
import { setBusy, status, submit } from "./submit";

/**
 * Form block enhancement. The form posts to the Hub natively without JavaScript; with it:
 * inline validation (`aria-invalid` + messages in `.os-field__error`), async submit, field
 * errors returned by the Hub, success message or redirect, and — when the Hub can't be
 * reached — a saved retry queue plus a fallback telling visitors how to email the owner
 * (`data-os-owner-email`).
 */
const QUEUE = "os-form-queue";
type Queued = { action: string; fields: [string, string][]; at: number };

function errorEl(field: HTMLInputElement): HTMLElement | null {
  const ids = (field.getAttribute("aria-describedby") ?? "").split(/\s+/);
  for (const id of ids) {
    const el = id ? document.getElementById(id) : null;
    if (el?.classList.contains("os-field__error")) return el;
  }
  return field.closest(".os-field")?.querySelector<HTMLElement>(".os-field__error") ?? null;
}

function mark(field: HTMLInputElement, message: string): void {
  field.setAttribute("aria-invalid", message ? "true" : "false");
  const el = errorEl(field);
  if (el) el.textContent = message;
}

function validate(field: HTMLInputElement): boolean {
  const ok = field.checkValidity();
  mark(field, ok ? "" : field.dataset.osMessage || field.validationMessage);
  return ok;
}

async function flush(): Promise<void> {
  const queue = load<Queued[]>(QUEUE, []);
  if (queue.length === 0) return;
  const left: Queued[] = [];
  for (const item of queue) {
    const r = await submit(item.action, new URLSearchParams(item.fields));
    // Keep for retry only while unreachable and less than a week old.
    if (!r.ok && r.unreachable && Date.now() - item.at < 7 * 864e5) left.push(item);
  }
  save(QUEUE, left);
}

let flushing = false;
function scheduleFlush(): void {
  if (flushing) return;
  flushing = true;
  flush().finally(() => {
    flushing = false;
  });
}

export default function form(el: HTMLElement): void {
  const f = el as HTMLFormElement;
  f.noValidate = true;
  const fields = () =>
    [...f.elements].filter(
      (x): x is HTMLInputElement => "checkValidity" in x && (x as HTMLInputElement).name !== "",
    );
  for (const field of fields()) {
    field.addEventListener("blur", () => {
      if (field.value !== "" || field.getAttribute("aria-invalid") === "true") validate(field);
    });
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true") validate(field);
    });
  }
  scheduleFlush();
  addEventListener("online", scheduleFlush);

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const invalid = fields().filter((x) => !validate(x));
    if (invalid.length) {
      invalid[0]?.focus();
      status(
        f,
        "error",
        invalid.length === 1
          ? "Please fix the highlighted field."
          : `Please fix the ${invalid.length} highlighted fields.`,
      );
      return;
    }
    setBusy(f, true);
    status(f, "", "");
    const data = new FormData(f);
    const r = await submit(f.action, data);
    setBusy(f, false);
    if (r.ok) {
      const to = r.body?.redirect ?? f.dataset.osRedirect;
      if (to) {
        location.assign(to);
        return;
      }
      f.reset();
      status(
        f,
        "success",
        r.body?.message ?? f.dataset.osSuccess ?? "Thanks — your message was sent.",
      );
      return;
    }
    if (r.body?.errors) {
      for (const field of fields()) {
        const msg = r.body.errors[field.name];
        if (msg) mark(field, msg);
      }
      status(f, "error", r.body.message ?? "Please check the highlighted fields.");
      return;
    }
    if (r.unreachable) {
      const fieldsData: [string, string][] = [];
      for (const [k, v] of data) if (typeof v === "string") fieldsData.push([k, v]);
      const queue = load<Queued[]>(QUEUE, []);
      queue.push({ action: f.action, fields: fieldsData, at: Date.now() });
      save(QUEUE, queue.slice(-20));
      const owner = f.dataset.osOwnerEmail;
      const msg = h(
        "span",
        {},
        "We couldn't send this right now. It's saved on this device and we'll retry automatically",
      );
      if (owner)
        msg.append(", or you can email ", h("a", { href: `mailto:${owner}` }, owner), " directly.");
      else msg.append(".");
      status(f, "error", msg);
      return;
    }
    status(f, "error", r.body?.message ?? "Something went wrong. Please try again.");
  });
}
