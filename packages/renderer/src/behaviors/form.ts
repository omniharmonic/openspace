import { h, load, save } from "./shared";
import { setBusy, status, submit } from "./submit";

/**
 * Form block enhancement. The form posts to the Hub natively without JavaScript; with it:
 * inline validation (`aria-invalid` + messages in `.os-field__error`, including "pick at least
 * one" checkbox groups marked `data-os-required-group`), async submit, field
 * errors returned by the Hub, success message or redirect, and — when the Hub can't be
 * reached — a saved retry queue plus a fallback telling visitors how to email the owner
 * (`data-os-owner-email`).
 */
const QUEUE = "os-form-queue";
type Queued = {
  action: string;
  fields: [string, string][];
  at: number;
  /** Set once the Hub rejected the entry (its message, or ""); shown on the form later. */
  rejected?: string;
};

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

/**
 * "Pick at least one" checkbox groups: `<fieldset data-os-required-group="<name>"
 * data-os-message="…">`. HTML can't express this natively, so the group is checked here.
 */
function validateGroup(group: HTMLElement): boolean {
  const boxes = [...group.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
  const ok = boxes.length === 0 || boxes.some((b) => b.checked);
  for (const b of boxes) b.setAttribute("aria-invalid", ok ? "false" : "true");
  const el = group.querySelector<HTMLElement>(".os-field__error");
  if (el)
    el.textContent = ok ? "" : group.dataset.osMessage || "Please choose at least one option.";
  return ok;
}

function validate(field: HTMLInputElement): boolean {
  const group = field.closest<HTMLElement>("[data-os-required-group]");
  if (group && field.type === "checkbox") return validateGroup(group);
  const ok = field.checkValidity();
  mark(field, ok ? "" : field.dataset.osMessage || field.validationMessage);
  return ok;
}

/**
 * Retry queued entries. Entries that still can't reach the Hub stay queued (up to a week).
 * Entries the Hub rejects are reported on their form; if that form isn't on the current page
 * the rejection is kept (up to 30 days) and shown the next time the form is present, so
 * nothing is dropped silently.
 */
async function flush(): Promise<void> {
  const queue = load<Queued[]>(QUEUE, []);
  if (queue.length === 0) return;
  const left: Queued[] = [];
  for (const item of queue) {
    if (item.rejected === undefined) {
      const r = await submit(item.action, new URLSearchParams(item.fields));
      if (r.ok) continue;
      if (r.unreachable) {
        if (Date.now() - item.at < 7 * 864e5) left.push(item);
        continue;
      }
      item.rejected = r.body?.message ?? "";
    }
    const target = [...document.querySelectorAll<HTMLFormElement>("form")].find(
      (f) => f.action === item.action,
    );
    if (target) {
      const reason = item.rejected ? ` (${item.rejected})` : "";
      status(
        target,
        "error",
        `A message you sent earlier couldn't be delivered${reason}. Please send it again.`,
      );
    } else if (Date.now() - item.at < 30 * 864e5) {
      left.push(item);
    }
  }
  save(QUEUE, left);
}

const LEASE = "os-form-queue-lease";

/**
 * Run `fn` only if no other tab is flushing the queue right now (two tabs replaying the same
 * entries would submit them twice). Web Locks when available; otherwise a short localStorage
 * lease, re-read after writing so the last writer wins a race.
 */
async function exclusive(fn: () => Promise<void>): Promise<void> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks?.request) {
    await locks.request(QUEUE, { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
    return;
  }
  const me = Math.random().toString(36).slice(2);
  const held = load<{ by: string; until: number } | null>(LEASE, null);
  if (held && held.until > Date.now()) return;
  save(LEASE, { by: me, until: Date.now() + 30_000 });
  if (load<{ by?: string } | null>(LEASE, null)?.by !== me) return;
  try {
    await fn();
  } finally {
    try {
      localStorage.removeItem(LEASE);
    } catch {
      /* storage blocked */
    }
  }
}

/**
 * File fields: upload each chosen file to the Hub first (`<action>/uploads` hands out a one-time
 * upload address), then send the upload's id in place of the file. Returns false (after marking
 * the field) when a file can't be uploaded.
 */
async function uploadFiles(f: HTMLFormElement, data: FormData): Promise<boolean> {
  for (const input of f.querySelectorAll<HTMLInputElement>("input[type=file][name]")) {
    const file = input.files?.[0];
    data.delete(input.name);
    if (!file) continue;
    const max = Number(input.dataset.osMaxBytes) || 0;
    let message = max && file.size > max ? `This file is larger than ${max >> 20} MB.` : "";
    if (!message) {
      try {
        const res = await fetch(`${f.action}/uploads`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ field: input.name, name: file.name, type: file.type, size: file.size }),
        });
        const b = (await res.json().catch(() => ({}))) as {
          id?: string;
          uploadUrl?: string;
          message?: string;
        };
        if (res.ok && b.id && b.uploadUrl) {
          const put = await fetch(b.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (put.ok) {
            data.set(input.name, b.id);
            continue;
          }
        }
        message = b.message ?? "We couldn't upload this file. Please try again.";
      } catch {
        message = "We couldn't upload this file. Please check your connection and try again.";
      }
    }
    mark(input, message);
    input.focus();
    return false;
  }
  return true;
}

let flushing = false;
function scheduleFlush(): void {
  if (flushing) return;
  flushing = true;
  exclusive(flush).finally(() => {
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
  // "Pick at least one" groups are only checked on blur once a submit has been attempted, so
  // tabbing through the boxes never raises an error before the visitor has had a chance.
  let attempted = false;
  for (const field of fields()) {
    const inGroup = field.type === "checkbox" && !!field.closest("[data-os-required-group]");
    field.addEventListener("blur", () => {
      if (inGroup && !attempted) return;
      if (field.value !== "" || field.getAttribute("aria-invalid") === "true") validate(field);
    });
    field.addEventListener(field.type === "checkbox" ? "change" : "input", () => {
      if (field.getAttribute("aria-invalid") === "true") validate(field);
    });
  }
  scheduleFlush();
  addEventListener("online", scheduleFlush);

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    attempted = true;
    // One entry per invalid control; a required group counts once (its first box).
    const seen = new Set<Element>();
    const invalid = fields().filter((x) => {
      const group = x.type === "checkbox" ? x.closest("[data-os-required-group]") : null;
      if (group) {
        if (seen.has(group)) return false;
        seen.add(group);
      }
      return !validate(x);
    });
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
    // A no-JS confirmation still showing from an earlier submission (`#…-sent` target) would
    // repeat the status region's announcement; the live region is the single source from here.
    for (const p of f.querySelectorAll<HTMLElement>(".os-formblock__sent")) p.hidden = true;
    const data = new FormData(f);
    if (!(await uploadFiles(f, data))) {
      setBusy(f, false);
      status(f, "error", "Please fix the highlighted field.");
      return;
    }
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
