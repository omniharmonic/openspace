import { type Redirect, RedirectSchema } from "@openspace/schema";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, IconButton, Input, Select } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { useSiteUpdate } from "../site-chrome/controls";

type Status = "301" | "302" | "307" | "308";
const STATUS: Array<{ value: Status; label: string }> = [
  { value: "301", label: "301 · Permanent" },
  { value: "302", label: "302 · Temporary" },
  { value: "307", label: "307 · Temporary (keep method)" },
  { value: "308", label: "308 · Permanent (keep method)" },
];

/** Normalise what was typed: "old-page" → "/old-page"; full URLs stay as they are. */
export function normalizeRedirectPath(raw: string, allowUrl: boolean): string {
  const v = raw.trim();
  if (allowUrl && /^https?:\/\//i.test(v)) return v;
  return `/${v.replace(/^\/+/, "")}`;
}

/** Why a redirect can't be saved (null when it's fine). */
export function redirectProblem(r: Redirect, others: Redirect[]): string | null {
  const parsed = RedirectSchema.safeParse(r);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    return path === "from"
      ? "The old address must start with / and can't contain spaces."
      : "Enter a page address like /new or a full https:// address.";
  }
  if (r.from === r.to) return "A redirect can't point to itself.";
  if (others.some((o) => o.from === r.from)) return `${r.from} already redirects.`;
  return null;
}

/** Redirects manager (`site.redirects`): old addresses that send visitors somewhere else. */
export function RedirectsManager({ disabled }: { disabled?: boolean }) {
  const redirects = useDocStore((s) => s.doc.site.redirects ?? []);
  const update = useSiteUpdate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<Status>("301");
  const draft: Redirect = {
    from: normalizeRedirectPath(from, false),
    to: normalizeRedirectPath(to, true),
    status: Number(status) as Redirect["status"],
  };
  const problem = from && to ? redirectProblem(draft, redirects) : null;

  const save = (next: Redirect[], label: string) =>
    update(label, next.length ? { set: { redirects: next } } : { unset: ["redirects"] });

  return (
    <div className="st-redirects">
      {redirects.length > 0 && (
        <table className="st-table">
          <thead>
            <tr>
              <th scope="col">Old address</th>
              <th scope="col">
                <span className="st-visually-hidden">to</span>
              </th>
              <th scope="col">Goes to</th>
              <th scope="col">Type</th>
              <th scope="col">
                <span className="st-visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {redirects.map((r, i) => (
              <tr key={r.from}>
                <td className="st-code">{r.from}</td>
                <td aria-hidden="true">
                  <ArrowRight className="st-inline-icon" />
                </td>
                <td className="st-code st-records__value">{r.to}</td>
                <td>
                  <Select<Status>
                    aria-label={`Type for ${r.from}`}
                    size="sm"
                    disabled={disabled}
                    value={String(r.status) as Status}
                    onValueChange={(s) =>
                      save(
                        redirects.map((x, j) =>
                          j === i ? { ...x, status: Number(s) as Redirect["status"] } : x,
                        ),
                        "Change redirect type",
                      )
                    }
                    options={STATUS}
                  />
                </td>
                <td>
                  <IconButton
                    label={`Remove redirect from ${r.from}`}
                    icon={<Trash2 />}
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      save(
                        redirects.filter((_, j) => j !== i),
                        "Remove redirect",
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form
        className="st-redirects__add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!from || !to || problem) return;
          if (save([...redirects, draft], "Add redirect")) {
            setFrom("");
            setTo("");
          }
        }}
      >
        <Input
          aria-label="Old address"
          placeholder="/old-page"
          value={from}
          disabled={disabled}
          onChange={(e) => setFrom(e.target.value)}
        />
        <ArrowRight aria-hidden="true" className="st-inline-icon" />
        <Input
          aria-label="New address"
          placeholder="/new-page or https://…"
          value={to}
          disabled={disabled}
          onChange={(e) => setTo(e.target.value)}
        />
        <Select<Status>
          aria-label="Redirect type"
          value={status}
          onValueChange={setStatus}
          options={STATUS}
          disabled={disabled}
        />
        <Button
          type="submit"
          icon={<Plus />}
          disabled={disabled || !from || !to || Boolean(problem)}
        >
          Add
        </Button>
      </form>
      {problem && (
        <p className="st-media-warn" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
