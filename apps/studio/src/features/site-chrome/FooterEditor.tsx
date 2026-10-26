import { FOOTER, type OpBody } from "@openspace/ops";
import { networkLabel, SocialIcon } from "@openspace/renderer";
import { SOCIAL_NETWORKS, type SocialProfile } from "@openspace/schema";
import { MousePointerClick, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Field, IconButton, Input, Select, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { ThemePicker, useSiteUpdate } from "./controls";

type Network = (typeof SOCIAL_NETWORKS)[number];

function normalizeProfileUrl(network: Network, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (network === "email") return v.startsWith("mailto:") ? v : `mailto:${v}`;
  const url = /^https?:\/\//.test(v) ? v.replace(/^http:/, "https:") : `https://${v}`;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function SocialRow({
  profile,
  onChange,
  onRemove,
}: {
  profile: SocialProfile;
  onChange: (p: SocialProfile) => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState(profile.url);
  return (
    <li className="st-social__row">
      <span className="st-social__icon" aria-hidden="true">
        <SocialIcon network={profile.network} />
      </span>
      <Select<Network>
        aria-label="Network"
        size="sm"
        value={profile.network}
        onValueChange={(network) => onChange({ ...profile, network })}
        options={SOCIAL_NETWORKS.map((n) => ({ value: n, label: networkLabel(n) }))}
      />
      <Input
        size="sm"
        aria-label={`${networkLabel(profile.network)} address`}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => {
          const next = normalizeProfileUrl(profile.network, url);
          if (next && next !== profile.url) onChange({ ...profile, url: next });
          else if (!next) {
            setUrl(profile.url);
            toast({ tone: "danger", title: "Enter a full https:// address" });
          }
        }}
      />
      <IconButton
        label={`Remove ${networkLabel(profile.network)}`}
        icon={<Trash2 />}
        size="sm"
        onClick={onRemove}
      />
    </li>
  );
}

/**
 * Footer editor: the footer is a section on every page (edited on the canvas like any other);
 * here are its colors, a shortcut to select it, and the site's social profiles it can show.
 */
export function FooterEditor() {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const footer = doc.site.footer;
  const social = doc.site.social ?? [];
  const update = useSiteUpdate();
  const setSocial = (next: SocialProfile[], label: string) =>
    update(label, next.length ? { set: { social: next } } : { unset: ["social"] });

  return (
    <div className="st-chrome">
      <section className="st-chrome__group" aria-label="Footer">
        <p className="st-chrome__lede">
          Your footer appears at the bottom of every page. Click it on the page to edit its words,
          links and layout, like any other section.
        </p>
        <Button
          size="sm"
          icon={<MousePointerClick />}
          onClick={() => {
            const s = api.getState();
            s.select({ kind: "section", id: footer.id });
            const frame = document.querySelector<HTMLIFrameElement>(
              ".st-ed-canvas iframe, iframe[title]",
            );
            frame?.contentDocument
              ?.querySelector(`[data-os-section="${footer.id}"]`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          Select the footer on the page
        </Button>
        <Field label="Colors">
          <ThemePicker
            value={footer.style.colorTheme}
            onChange={(t) =>
              api.getState().commit(
                [
                  {
                    op: "section.update",
                    page: FOOTER,
                    section: footer.id,
                    set: { "style.colorTheme": t },
                  } as OpBody,
                ],
                { label: "Footer colors" },
              )
            }
          />
        </Field>
      </section>

      <section className="st-chrome__group" aria-labelledby="ftr-social">
        <h3 id="ftr-social" className="st-chrome__title">
          Social profiles
        </h3>
        <p className="st-chrome__lede">
          Used by social icons in the header, footer and social blocks.
        </p>
        {social.length > 0 && (
          <ul className="st-social">
            {social.map((p, i) => (
              <SocialRow
                // biome-ignore lint/suspicious/noArrayIndexKey: profiles have no id; order is the identity
                key={`${i}-${p.network}`}
                profile={p}
                onChange={(next) =>
                  setSocial(
                    social.map((x, j) => (j === i ? next : x)),
                    "Edit social profile",
                  )
                }
                onRemove={() =>
                  setSocial(
                    social.filter((_, j) => j !== i),
                    "Remove social profile",
                  )
                }
              />
            ))}
          </ul>
        )}
        <AddSocial
          taken={new Set(social.map((s) => s.network))}
          onAdd={(p) => setSocial([...social, p], "Add social profile")}
        />
      </section>
    </div>
  );
}

function AddSocial({ taken, onAdd }: { taken: Set<string>; onAdd: (p: SocialProfile) => void }) {
  const first = SOCIAL_NETWORKS.find((n) => !taken.has(n)) ?? "instagram";
  const [network, setNetwork] = useState<Network>(first);
  const [url, setUrl] = useState("");
  const next = normalizeProfileUrl(network, url);
  return (
    <form
      className="st-social__add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!next) return;
        onAdd({ network, url: next });
        setUrl("");
      }}
    >
      <Select<Network>
        aria-label="New profile network"
        size="sm"
        value={network}
        onValueChange={setNetwork}
        options={SOCIAL_NETWORKS.map((n) => ({ value: n, label: networkLabel(n) }))}
      />
      <Input
        size="sm"
        aria-label="New profile address"
        placeholder={network === "email" ? "hello@example.com" : "instagram.com/yourname"}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <IconButton label="Add profile" icon={<Plus />} size="sm" type="submit" disabled={!next} />
    </form>
  );
}
