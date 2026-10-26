import { compiledStylesFor } from "@openspace/renderer";
import {
  type Announcement,
  AnnouncementSchema,
  type Popup,
  PopupSchema,
  type SiteDocument,
} from "@openspace/schema";
import { Mail, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Field, Input, NumberScrubInput, Segmented, Select, Slider, TextArea } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { useMediaPreviewUrl } from "../media/sources";
import { ImagePick, LinkField, SwitchRow, ThemePicker, useSiteUpdate } from "./controls";

function themeColors(doc: SiteDocument, theme: string) {
  const themes = compiledStylesFor(doc.styles).tokens.themes as unknown as Record<
    string,
    Record<string, string>
  >;
  return themes[theme] ?? themes.light ?? {};
}

/** Keep a draft of text fields locally; commit only valid values (schemas need non-empty text). */
function useDraft<T>(value: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft];
}

// ---------------------------------------------------------------------------------------------

const DEFAULT_ANNOUNCEMENT: Announcement = {
  enabled: true,
  message: "Spring classes are open — save your spot.",
  dismissible: true,
};

/** Announcement bar: a one-line message across the top of every page. */
export function AnnouncementEditor() {
  const doc = useDocStore((s) => s.doc);
  const update = useSiteUpdate();
  const a = doc.site.announcement ?? null;
  const [message, setMessage] = useDraft(a?.message ?? "");
  const write = (next: Announcement, label: string, mergeKey?: string) => {
    if (!AnnouncementSchema.safeParse(next).success) return false;
    return update(label, { set: { announcement: next } }, mergeKey);
  };
  const colors = useMemo(
    () => themeColors(doc, a?.colorTheme ?? "dark-accent"),
    [doc, a?.colorTheme],
  );

  return (
    <div className="st-chrome">
      <section className="st-chrome__group" aria-label="Announcement bar">
        <SwitchRow
          label="Show an announcement bar"
          hint="A short message across the top of every page."
          checked={Boolean(a?.enabled)}
          onChange={(on) =>
            a
              ? write({ ...a, enabled: on }, on ? "Show announcement" : "Hide announcement")
              : write(DEFAULT_ANNOUNCEMENT, "Add announcement")
          }
        />
        {a && (
          <>
            <div
              className="st-banner-preview"
              style={{ background: colors.background, color: colors.text }}
              aria-hidden="true"
            >
              <span>{message || " "}</span>
              {(a.dismissible ?? true) && <X />}
            </div>
            <Field
              label="Message"
              aside={`${message.length}/200`}
              error={message.trim() ? undefined : "Write a short message."}
            >
              <TextArea
                rows={2}
                maxLength={200}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (e.target.value.trim())
                    write(
                      { ...a, message: e.target.value },
                      "Announcement message",
                      "announcement-message",
                    );
                }}
              />
            </Field>
            <SwitchRow
              label="Link the message"
              checked={Boolean(a.link)}
              onChange={(on) => {
                if (on) {
                  const first = Object.values(doc.pages)[0];
                  if (first)
                    write({ ...a, link: { type: "page", page: first.id } }, "Link announcement");
                } else {
                  const { link: _l, ...rest } = a;
                  write(rest, "Unlink announcement");
                }
              }}
            />
            {a.link && (
              <LinkField
                doc={doc}
                value={a.link}
                onChange={(link) => write({ ...a, link }, "Announcement link")}
              />
            )}
            <SwitchRow
              label="Visitors can close it"
              checked={a.dismissible ?? true}
              onChange={(v) => write({ ...a, dismissible: v }, "Announcement can be closed")}
            />
            <Field label="Colors">
              <ThemePicker
                value={a.colorTheme ?? "dark-accent"}
                onChange={(t) => write({ ...a, colorTheme: t }, "Announcement colors")}
              />
            </Field>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

/** A plain-language reason a pop-up edit couldn't be saved. */
export function popupProblem(issue: { path: PropertyKey[]; message: string } | undefined): string {
  const key = issue?.path.map(String).join(".") ?? "";
  if (key === "heading") return "the heading can't be empty.";
  if (key === "cta.label") return "the button needs some words.";
  if (key === "delaySeconds") return "use a delay between 0 and 600 seconds.";
  if (key === "scrollPercent") return "use a scroll depth between 5% and 100%.";
  if (key === "frequencyDays") return "use between 0 and 365 days.";
  if (key.startsWith("image")) return "the image description is too long.";
  if (key.startsWith("cta.link")) return "check the button's link.";
  return issue?.message ?? "that value isn't allowed.";
}

const DEFAULT_POPUP: Popup = {
  enabled: true,
  trigger: "time",
  delaySeconds: 8,
  frequencyDays: 7,
  heading: "Letters from the studio",
  body: "One short note a month: new dates, good reads, no spam.",
  newsletter: true,
};

type Frequency = "0" | "1" | "7" | "30" | "custom";
const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "0", label: "Every visit" },
  { value: "1", label: "Once a day" },
  { value: "7", label: "Once a week" },
  { value: "30", label: "Once a month" },
  { value: "custom", label: "Custom…" },
];

function PopupPreview({ popup, doc }: { popup: Popup; doc: SiteDocument }) {
  const colors = useMemo(
    () => themeColors(doc, popup.colorTheme ?? "light"),
    [doc, popup.colorTheme],
  );
  const image = useMediaPreviewUrl(popup.image?.src ?? null);
  return (
    <div className="st-popup-preview" aria-hidden="true">
      <div
        className="st-popup-preview__card"
        style={{ background: colors.background, color: colors.text }}
      >
        <X className="st-popup-preview__close" />
        {image && <img src={image} alt="" className="st-popup-preview__img" />}
        <strong style={{ fontFamily: "var(--os-font-heading, inherit)" }}>{popup.heading}</strong>
        {popup.body && <p style={{ color: colors["text-muted"] }}>{popup.body}</p>}
        {popup.cta && (
          <span
            className="st-popup-preview__btn"
            style={{ background: colors.accent, color: colors["on-accent"] }}
          >
            {popup.cta.label}
          </span>
        )}
        {popup.newsletter && (
          <span className="st-popup-preview__form">
            <span style={{ borderColor: colors.border }}>
              <Mail /> you@example.com
            </span>
            <span
              className="st-popup-preview__btn"
              style={{ background: colors.accent, color: colors["on-accent"] }}
            >
              Subscribe
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/** Pop-up: trigger, how often, and simple content (heading, words, image, button, signup). */
export function PopupEditor() {
  const doc = useDocStore((s) => s.doc);
  const update = useSiteUpdate();
  const p = doc.site.popup ?? null;
  const [heading, setHeading] = useDraft(p?.heading ?? "");
  const [body, setBody] = useDraft(p?.body ?? "");
  const [ctaLabel, setCtaLabel] = useDraft(p?.cta?.label ?? "");
  const [imageAlt, setImageAlt] = useDraft(p?.image?.alt ?? "");
  const freqPreset = (["0", "1", "7", "30"] as const).find((f) => Number(f) === p?.frequencyDays);
  const [freq, setFreq] = useState<Frequency>(freqPreset ?? "custom");
  useEffect(() => setFreq(freqPreset ?? "custom"), [freqPreset]);

  const [problem, setProblem] = useState<string | null>(null);
  const write = (next: Popup, label: string, mergeKey?: string) => {
    const parsed = PopupSchema.safeParse(next);
    if (!parsed.success) {
      setProblem(popupProblem(parsed.error.issues[0]));
      return false;
    }
    setProblem(null);
    return update(label, { set: { popup: next } }, mergeKey);
  };

  return (
    <div className="st-chrome">
      <section className="st-chrome__group" aria-label="Pop-up">
        <SwitchRow
          label="Show a pop-up"
          hint="Invite visitors to sign up or see an offer. It never shows in the editor."
          checked={Boolean(p?.enabled)}
          onChange={(on) =>
            p
              ? write({ ...p, enabled: on }, on ? "Turn on pop-up" : "Turn off pop-up")
              : write(DEFAULT_POPUP, "Add pop-up")
          }
        />
      </section>
      {p && (
        <>
          <PopupPreview popup={p} doc={doc} />
          {problem && (
            <p className="st-chrome__problem" role="alert">
              Not saved: {problem}
            </p>
          )}
          <section className="st-chrome__group" aria-labelledby="pop-when">
            <h3 id="pop-when" className="st-chrome__title">
              When it appears
            </h3>
            <Segmented
              aria-label="When the pop-up appears"
              block
              size="sm"
              value={p.trigger}
              onValueChange={(trigger) =>
                write(
                  {
                    ...p,
                    trigger,
                    ...(trigger === "time" ? { delaySeconds: p.delaySeconds ?? 8 } : {}),
                    ...(trigger === "scroll" ? { scrollPercent: p.scrollPercent ?? 50 } : {}),
                  },
                  "Pop-up trigger",
                )
              }
              options={[
                { value: "time", label: "Delay", ariaLabel: "After a delay" },
                { value: "scroll", label: "Scroll", ariaLabel: "On scroll" },
                { value: "exit-intent", label: "Leaving", ariaLabel: "When leaving the page" },
              ]}
            />
            {p.trigger === "time" && (
              <Field label="Seconds after the page opens">
                <NumberScrubInput
                  label="Seconds after the page opens"
                  value={p.delaySeconds ?? 8}
                  min={0}
                  max={600}
                  step={1}
                  unit="s"
                  onChange={(v) =>
                    write({ ...p, delaySeconds: Math.round(v) }, "Pop-up delay", "popup-delay")
                  }
                />
              </Field>
            )}
            {p.trigger === "scroll" && (
              <Field label={`After scrolling ${p.scrollPercent ?? 50}% of the page`}>
                <Slider
                  aria-label="Scroll depth"
                  min={5}
                  max={100}
                  step={5}
                  value={p.scrollPercent ?? 50}
                  onValueChange={(v) =>
                    write({ ...p, scrollPercent: v }, "Pop-up scroll depth", "popup-scroll")
                  }
                />
              </Field>
            )}
            {p.trigger === "exit-intent" && (
              <p className="st-muted-note">
                Shows when the pointer heads for the browser's close or back button (computers
                only).
              </p>
            )}
            <Field label="How often">
              <Select<Frequency>
                aria-label="How often"
                size="sm"
                value={freq}
                onValueChange={(f) => {
                  setFreq(f);
                  if (f !== "custom") write({ ...p, frequencyDays: Number(f) }, "Pop-up frequency");
                }}
                options={FREQUENCIES}
              />
            </Field>
            {freq === "custom" && (
              <Field label="At most once every (days)">
                <NumberScrubInput
                  label="Days between pop-ups"
                  value={p.frequencyDays}
                  min={0}
                  max={365}
                  step={1}
                  onChange={(v) =>
                    write({ ...p, frequencyDays: Math.round(v) }, "Pop-up frequency", "popup-freq")
                  }
                />
              </Field>
            )}
          </section>
          <section className="st-chrome__group" aria-labelledby="pop-content">
            <h3 id="pop-content" className="st-chrome__title">
              Content
            </h3>
            <Field label="Heading" error={heading.trim() ? undefined : "Write a short heading."}>
              <Input
                size="sm"
                value={heading}
                maxLength={120}
                onChange={(e) => {
                  setHeading(e.target.value);
                  if (e.target.value.trim())
                    write({ ...p, heading: e.target.value }, "Pop-up heading", "popup-heading");
                }}
              />
            </Field>
            <Field label="Words" aside={`${body.length}/600`}>
              <TextArea
                rows={3}
                maxLength={600}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  const { body: _b, ...rest } = p;
                  write(
                    e.target.value ? { ...p, body: e.target.value } : rest,
                    "Pop-up words",
                    "popup-body",
                  );
                }}
              />
            </Field>
            <Field label="Image">
              <ImagePick
                title="Choose a pop-up image"
                value={p.image?.src}
                onChange={(src) => {
                  const { image: _i, ...rest } = p;
                  const meta = src ? doc.media[src as keyof SiteDocument["media"]] : undefined;
                  write(
                    src
                      ? {
                          ...p,
                          image: {
                            src,
                            alt: meta?.alt ?? "",
                            ...(meta?.focal ? { focal: meta.focal } : {}),
                            ...(meta?.width && meta.height
                              ? { width: meta.width, height: meta.height }
                              : {}),
                          },
                        }
                      : rest,
                    "Pop-up image",
                  );
                }}
              />
            </Field>
            {p.image && (
              <Field label="Image description" hint="Read aloud to people using screen readers.">
                <Input
                  size="sm"
                  value={imageAlt}
                  maxLength={500}
                  placeholder="e.g. Students stretching in the morning light"
                  onChange={(e) => {
                    setImageAlt(e.target.value);
                    if (p.image)
                      write(
                        { ...p, image: { ...p.image, alt: e.target.value } },
                        "Pop-up image description",
                        "popup-alt",
                      );
                  }}
                />
              </Field>
            )}
            <SwitchRow
              label="Email signup"
              hint="Subscribers join your newsletter list."
              checked={Boolean(p.newsletter)}
              onChange={(v) => write({ ...p, newsletter: v }, "Pop-up signup")}
            />
            <SwitchRow
              label="Button"
              checked={Boolean(p.cta)}
              onChange={(on) => {
                const { cta: _c, ...rest } = p;
                const first = Object.values(doc.pages)[0];
                write(
                  on && first
                    ? { ...p, cta: { label: "Learn more", link: { type: "page", page: first.id } } }
                    : rest,
                  on ? "Add pop-up button" : "Remove pop-up button",
                );
              }}
            />
            {p.cta && (
              <>
                <Field label="Button text">
                  <Input
                    size="sm"
                    value={ctaLabel}
                    maxLength={40}
                    onChange={(e) => {
                      setCtaLabel(e.target.value);
                      if (e.target.value.trim() && p.cta)
                        write(
                          { ...p, cta: { ...p.cta, label: e.target.value } },
                          "Pop-up button text",
                          "popup-cta",
                        );
                    }}
                  />
                </Field>
                <LinkField
                  doc={doc}
                  value={p.cta.link}
                  onChange={(link) =>
                    p.cta && write({ ...p, cta: { ...p.cta, link } }, "Pop-up button link")
                  }
                />
              </>
            )}
            <Field label="Colors">
              <ThemePicker
                value={p.colorTheme ?? "light"}
                onChange={(t) => write({ ...p, colorTheme: t }, "Pop-up colors")}
              />
            </Field>
          </section>
        </>
      )}
    </div>
  );
}
