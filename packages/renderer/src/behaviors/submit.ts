/** Async form submission shared by the `form` and `newsletter` behaviors. */
export interface SubmitResult {
  ok: boolean;
  /** No response at all (network down, Hub unreachable) or a 5xx. */
  unreachable: boolean;
  status: number;
  body: { message?: string; redirect?: string; errors?: Record<string, string> } | undefined;
}

export async function submit(
  action: string,
  data: FormData | URLSearchParams,
): Promise<SubmitResult> {
  try {
    const res = await fetch(action, {
      method: "POST",
      body: data,
      headers: { Accept: "application/json" },
    });
    let body: SubmitResult["body"];
    try {
      body = (await res.json()) as SubmitResult["body"];
    } catch {
      body = undefined;
    }
    return { ok: res.ok, unreachable: res.status >= 500, status: res.status, body };
  } catch {
    return { ok: false, unreachable: true, status: 0, body: undefined };
  }
}

export function status(
  form: HTMLElement,
  state: "success" | "error" | "",
  content: string | Node = "",
): HTMLElement {
  let el = form.querySelector<HTMLElement>(".os-form__status");
  if (!el) {
    el = document.createElement("div");
    el.className = "os-form__status";
    form.append(el);
  }
  el.setAttribute("role", state === "error" ? "alert" : "status");
  el.dataset.state = state;
  el.replaceChildren(content);
  return el;
}

export function setBusy(form: HTMLFormElement, busy: boolean): void {
  form.setAttribute("aria-busy", String(busy));
  for (const b of form.querySelectorAll<HTMLButtonElement>(
    "button[type=submit],button:not([type])",
  )) {
    b.disabled = busy;
    b.classList.toggle("is-busy", busy);
  }
}
