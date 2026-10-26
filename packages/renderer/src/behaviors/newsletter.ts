import { setBusy, status, submit } from "./submit";

/** Newsletter signup: async subscribe to the Hub with inline confirmation (double opt-in). */
export default function newsletter(el: HTMLElement): void {
  const f = el as HTMLFormElement;
  const email = f.querySelector<HTMLInputElement>("input[type=email]");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (email && !email.checkValidity()) {
      email.setAttribute("aria-invalid", "true");
      status(f, "error", "Please enter a valid email address.");
      email.focus();
      return;
    }
    email?.setAttribute("aria-invalid", "false");
    setBusy(f, true);
    const r = await submit(f.action, new FormData(f));
    setBusy(f, false);
    if (r.ok) {
      f.reset();
      status(
        f,
        "success",
        r.body?.message ?? f.dataset.osSuccess ?? "Almost there — check your inbox to confirm.",
      );
    } else {
      status(
        f,
        "error",
        r.body?.message ??
          (r.unreachable
            ? "We couldn't reach the signup service. Please try again in a moment."
            : "That didn't work. Please check your email address."),
      );
    }
  });
}
