/* biome-ignore-all lint/suspicious/noExplicitAny: frontmatter is a union keyed by kind; each form reads its own keys. */
import type {
  CollectionConfig,
  CollectionItem,
  ImageValue,
  SiteDocument,
} from "@omniharmonic/openspace-schema";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useInventoryActions, useProducts } from "../../api";
import type { Site } from "../../api/types";
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  TextArea,
  toast,
} from "../../ui";
import { can } from "../site-mgmt/manage-ui";
import { duration, parseDuration } from "../workspace/format";
import { workspacePath } from "../workspace/routes";
import { errorMessage, SwitchRow, TagInput } from "../workspace/ui";
import { IntField, MediaField, MoneyField } from "./fields";
import { fromInputDateTime, localDate, toInputDateTime } from "./itemOps";
import { RepeatEditor } from "./RepeatEditor";
import { matchUntilType, retargetRule } from "./rrule";
import { suggestSku, syncVariants, variantLabel } from "./variants";
import "./collections.css";

type FM = Record<string, any>;

export interface FrontmatterProps {
  item: CollectionItem;
  onChange: (item: CollectionItem) => void;
  doc: SiteDocument;
  collection: string;
  config: CollectionConfig | undefined;
  site: Site;
  /** Problems by field label (from validation). */
  problems: Record<string, string>;
  /** Adds a category to the collection settings (designers). */
  onAddCategory?: (label: string) => void;
}

function useSetter(item: CollectionItem, onChange: (i: CollectionItem) => void) {
  return (patch: FM) => {
    const fm: FM = { ...item.frontmatter };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete fm[k];
      else fm[k] = v;
    }
    onChange({ ...item, frontmatter: fm } as CollectionItem);
  };
}

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
};

const TIME_ZONES: string[] = (() => {
  try {
    return (
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
        "timeZone",
      ) ?? []
    );
  } catch {
    return [];
  }
})();

/** Featured image, its description and the summary line used on lists and when shared. */
export function CoverFields({ item, onChange }: Pick<FrontmatterProps, "item" | "onChange">) {
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  return (
    <>
      <MediaField
        label="Featured image"
        value={fm.image}
        onChange={(src) => set({ image: src ?? undefined })}
      />
      {fm.image && (
        <Field label="Image description" hint="Describe the photo for people who can't see it.">
          <Input value={fm.imageAlt ?? ""} onChange={(e) => set({ imageAlt: e.target.value })} />
        </Field>
      )}
      <Field label="Excerpt" hint="One or two sentences shown in lists and when shared.">
        <TextArea
          rows={3}
          maxLength={500}
          value={fm.excerpt ?? ""}
          onChange={(e) => set({ excerpt: e.target.value })}
        />
      </Field>
    </>
  );
}

/** Categories (from the collection settings) and free tags. */
export function TaxonomyFields({
  item,
  onChange,
  doc,
  collection,
  config,
  onAddCategory,
}: FrontmatterProps) {
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  const cats = config?.taxonomies?.categories ?? [];
  const [newCat, setNewCat] = useState("");
  const allTags = useMemo(
    () => [
      ...new Set(
        Object.values(doc.collections[collection] ?? {}).flatMap((i) => i.frontmatter.tags ?? []),
      ),
    ],
    [doc, collection],
  );
  const chosen: string[] = fm.categories ?? [];
  return (
    <>
      <fieldset className="st-fieldset">
        <legend>Categories</legend>
        {cats.length === 0 && (
          <p className="st-ws-hint">
            Group posts into a few broad topics, like “News” or “Recipes”.
          </p>
        )}
        {cats.map((c) => (
          <label key={c.slug} className="st-ws-check">
            <input
              type="checkbox"
              checked={chosen.includes(c.slug)}
              onChange={(e) =>
                set({
                  categories: e.target.checked
                    ? [...chosen, c.slug]
                    : chosen.filter((s) => s !== c.slug),
                })
              }
            />
            {c.label}
          </label>
        ))}
        {onAddCategory && (
          <form
            className="st-inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCat.trim()) onAddCategory(newCat.trim());
              setNewCat("");
            }}
          >
            <Input
              size="sm"
              aria-label="New category"
              placeholder="New category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <Button size="sm" type="submit" icon={<Plus />} disabled={!newCat.trim()}>
              Add
            </Button>
          </form>
        )}
      </fieldset>
      {config?.taxonomies?.tags !== false && (
        <Field label="Tags" hint="Press Enter after each tag.">
          <TagInput
            label="Tags"
            value={fm.tags ?? []}
            suggestions={allTags}
            onChange={(tags) => set({ tags })}
          />
        </Field>
      )}
    </>
  );
}

export function BlogFields(props: FrontmatterProps) {
  const { item, onChange, doc, collection } = props;
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  const authors = useMemo(
    () =>
      [
        ...new Set(
          Object.values(doc.collections[collection] ?? {})
            .map((i) => (i.frontmatter as FM).author)
            .filter(Boolean),
        ),
      ] as string[],
    [doc, collection],
  );
  return (
    <>
      <Field label="Author">
        <Input
          list="st-authors"
          value={fm.author ?? ""}
          maxLength={80}
          onChange={(e) => set({ author: e.target.value })}
        />
      </Field>
      <datalist id="st-authors">
        {authors.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <SwitchRow
        label={<>Featured</>}
        hint={<>Show it first where featured posts appear.</>}
        checked={Boolean(fm.featured)}
        onCheckedChange={(v) => set({ featured: v || undefined })}
      />
    </>
  );
}

export function EventFields({ item, onChange, problems }: FrontmatterProps) {
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  const allDay = Boolean(fm.allDay) || /^\d{4}-\d{2}-\d{2}$/.test(fm.start ?? "");
  const loc: FM = fm.location ?? {};
  // The start being typed; the repeat rule follows only once the new date is committed (blur),
  // not on every intermediate keystroke.
  const editingFrom = useRef<string | null>(null);
  const setStart = (start: string) => {
    if (editingFrom.current === null) editingFrom.current = String(fm.start);
    set({ start });
  };
  const commitStart = () => {
    const from = editingFrom.current;
    editingFrom.current = null;
    if (from && fm.recurrence && from !== fm.start)
      set({ recurrence: retargetRule(fm.recurrence, from, String(fm.start)) });
  };
  const setLoc = (patch: FM) => {
    const next: FM = { ...loc };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "" || v === false) delete next[k];
      else next[k] = v;
    }
    set({ location: Object.keys(next).length ? next : undefined });
  };
  return (
    <>
      <SwitchRow
        label={<>All day</>}
        checked={allDay}
        onCheckedChange={(v) => {
          const start = v
            ? (fm.start ?? localDate(Date.now())).slice(0, 10)
            : (fromInputDateTime(`${String(fm.start).slice(0, 10)}T18:00`) ?? fm.start);
          // UNTIL has the same value type as the start (a date for all-day events).
          const recurrence = fm.recurrence ? matchUntilType(fm.recurrence, start) : undefined;
          if (v)
            set({
              allDay: true,
              start,
              end: fm.end ? String(fm.end).slice(0, 10) : undefined,
              recurrence,
            });
          else
            set({
              allDay: undefined,
              start,
              end: fm.end
                ? (fromInputDateTime(`${String(fm.end).slice(0, 10)}T19:30`) ?? undefined)
                : undefined,
              recurrence,
            });
        }}
      />
      <div className="st-ws-cols">
        <Field label="Starts" error={problems.Start}>
          {allDay ? (
            <Input
              type="date"
              value={String(fm.start ?? "").slice(0, 10)}
              onChange={(e) => e.target.value && setStart(e.target.value)}
              onBlur={commitStart}
            />
          ) : (
            <Input
              type="datetime-local"
              value={toInputDateTime(fm.start)}
              onChange={(e) => {
                const v = fromInputDateTime(e.target.value, fm.start);
                if (v) setStart(v);
              }}
              onBlur={commitStart}
            />
          )}
        </Field>
        <Field label="Ends" error={problems.End}>
          {allDay ? (
            <Input
              type="date"
              value={String(fm.end ?? "").slice(0, 10)}
              onChange={(e) => set({ end: e.target.value })}
            />
          ) : (
            <Input
              type="datetime-local"
              value={toInputDateTime(fm.end)}
              onChange={(e) =>
                set({ end: fromInputDateTime(e.target.value, fm.start) ?? undefined })
              }
            />
          )}
        </Field>
      </div>
      {!allDay && (
        <Field label="Time zone" hint="Times are shown in this zone on your site.">
          {TIME_ZONES.length ? (
            <Select
              value={fm.timezone}
              placeholder="Choose a time zone"
              onValueChange={(timezone) => set({ timezone })}
              options={TIME_ZONES.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
            />
          ) : (
            <Input value={fm.timezone ?? ""} onChange={(e) => set({ timezone: e.target.value })} />
          )}
        </Field>
      )}
      <RepeatEditor
        start={String(fm.start ?? "")}
        value={fm.recurrence}
        onChange={(recurrence) => set({ recurrence })}
      />
      <fieldset className="st-fieldset">
        <legend>Where</legend>
        <Field label="Place name">
          <Input value={loc.name ?? ""} onChange={(e) => setLoc({ name: e.target.value })} />
        </Field>
        <Field label="Address">
          <Input value={loc.address ?? ""} onChange={(e) => setLoc({ address: e.target.value })} />
        </Field>
        <Field label="Map link" error={problems["Map link"]}>
          <Input
            placeholder="https://maps.google.com/…"
            value={loc.mapUrl ?? ""}
            onChange={(e) => setLoc({ mapUrl: e.target.value })}
          />
        </Field>
        <SwitchRow
          label={<>Online</>}
          hint={<>Happens over video, or both in person and online.</>}
          checked={Boolean(loc.online)}
          onCheckedChange={(v) => setLoc({ online: v })}
        />
        {loc.online && (
          <Field label="Online link" error={problems["Online link"]}>
            <Input
              placeholder="https://…"
              value={loc.url ?? ""}
              onChange={(e) => setLoc({ url: e.target.value })}
            />
          </Field>
        )}
      </fieldset>
      <Field
        label="RSVP or ticket link"
        hint="Where people sign up or buy tickets."
        error={problems["Sign-up link"]}
      >
        <Input
          placeholder="https://…"
          value={fm.registrationUrl ?? ""}
          onChange={(e) => set({ registrationUrl: e.target.value })}
        />
      </Field>
      <Field label="Price" hint="As you'd say it, e.g. “Free” or “$22”.">
        <Input
          maxLength={60}
          value={fm.price ?? ""}
          onChange={(e) => set({ price: e.target.value })}
        />
      </Field>
    </>
  );
}

export function PortfolioFields({ item, onChange, problems }: FrontmatterProps) {
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  const gallery: ImageValue[] = fm.gallery ?? [];
  return (
    <>
      <div className="st-ws-cols">
        <Field label="Client">
          <Input value={fm.client ?? ""} onChange={(e) => set({ client: e.target.value })} />
        </Field>
        <Field label="Your role">
          <Input value={fm.role ?? ""} onChange={(e) => set({ role: e.target.value })} />
        </Field>
      </div>
      <IntField
        label="Year"
        value={fm.year}
        min={1900}
        max={2200}
        onChange={(year) => set({ year })}
      />
      <Field label="Project link" error={problems["Project link"]}>
        <Input
          placeholder="https://…"
          value={fm.projectUrl ?? ""}
          onChange={(e) => set({ projectUrl: e.target.value })}
        />
      </Field>
      <ImageList label="Gallery" images={gallery} onChange={(g) => set({ gallery: g })} />
    </>
  );
}

/** A list of photos with descriptions (portfolio galleries, product photos). */
export function ImageList({
  label,
  images,
  onChange,
}: {
  label: string;
  images: ImageValue[];
  onChange: (images: ImageValue[]) => void;
}) {
  return (
    <fieldset className="st-fieldset">
      <legend>{label}</legend>
      {images.length === 0 && <p className="st-ws-hint">No photos yet.</p>}
      {images.map((img, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the same photo may appear twice
        <div key={`${img.src}-${i}`} className="st-imagelist__row">
          <MediaField
            label={`Photo ${i + 1}`}
            value={img.src}
            onChange={(src) =>
              onChange(
                src
                  ? images.map((x, j) => (j === i ? { ...x, src } : x))
                  : images.filter((_, j) => j !== i),
              )
            }
          />
          <Field label="Description">
            <Input
              value={img.alt}
              onChange={(e) =>
                onChange(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))
              }
            />
          </Field>
        </div>
      ))}
      <AddPhoto onPick={(src) => onChange([...images, { src, alt: "" }])} />
    </fieldset>
  );
}

function AddPhoto({ onPick }: { onPick: (src: string) => void }) {
  return <MediaField label="Add a photo" value={null} onChange={(src) => src && onPick(src)} />;
}

export function PodcastFields({ item, onChange, problems }: FrontmatterProps) {
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  const audio: FM = fm.audio ?? { src: "", duration: 0, mime: "audio/mpeg" };
  const [lengthText, setLengthText] = useState(audio.duration ? duration(audio.duration) : "");
  const setAudio = (patch: FM) => set({ audio: { ...audio, ...patch } });
  return (
    <>
      <MediaField
        label="Audio file"
        accept="any"
        value={audio.src || null}
        error={problems["Audio file"]}
        hint="An MP3 or M4A from your library, or a link from your podcast host."
        onChange={(src) => {
          const ext = src?.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
          setAudio({ src: src ?? "", ...(MIME_BY_EXT[ext] ? { mime: MIME_BY_EXT[ext] } : {}) });
        }}
      />
      <div className="st-ws-cols">
        <Field label="Length" hint="Like 45:10" error={problems.Length}>
          <Input
            value={lengthText}
            placeholder="45:10"
            onChange={(e) => {
              setLengthText(e.target.value);
              const s = parseDuration(e.target.value);
              if (s !== null) setAudio({ duration: s });
            }}
          />
        </Field>
        <Field label="Audio type">
          <Select
            value={audio.mime}
            onValueChange={(mime) => setAudio({ mime })}
            options={[
              { value: "audio/mpeg", label: "MP3" },
              { value: "audio/mp4", label: "M4A" },
              { value: "audio/aac", label: "AAC" },
              { value: "audio/ogg", label: "OGG" },
              { value: "audio/wav", label: "WAV" },
            ]}
          />
        </Field>
      </div>
      <div className="st-ws-cols">
        <IntField label="Season" value={fm.season} min={1} onChange={(season) => set({ season })} />
        <IntField
          label="Episode"
          value={fm.episode}
          min={0}
          onChange={(episode) => set({ episode })}
        />
      </div>
      <Field label="Episode type">
        <Segmented
          aria-label="Episode type"
          value={fm.episodeType ?? "full"}
          onValueChange={(v) => set({ episodeType: v === "full" ? undefined : v })}
          options={[
            { value: "full", label: "Full" },
            { value: "trailer", label: "Trailer" },
            { value: "bonus", label: "Bonus" },
          ]}
        />
      </Field>
      <SwitchRow
        label={<>Explicit</>}
        hint={<>Apple and Spotify label the episode for listeners.</>}
        checked={Boolean(fm.explicit)}
        onCheckedChange={(v) => set({ explicit: v || undefined })}
      />
      <MediaField
        label="Transcript"
        accept="any"
        value={fm.transcript}
        onChange={(src) => set({ transcript: src ?? undefined })}
      />
    </>
  );
}

export function ProductFields({ item, onChange, problems, site, collection }: FrontmatterProps) {
  const set = useSetter(item, onChange);
  const fm = item.frontmatter as FM;
  const currency: string = fm.price?.currency ?? "USD";
  const options: Array<{ name: string; values: string[] }> = fm.options ?? [];
  const variants: FM[] = fm.variants ?? [];
  const baseSku: string =
    fm.sku ?? `${collection}/${item.slug}`.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  const setOptions = (next: Array<{ name: string; values: string[] }>) => {
    const clean = next.filter((o) => o.name.trim() || o.values.length);
    set({
      options: clean.length ? clean : undefined,
      variants: clean.some((o) => o.name.trim() && o.values.length)
        ? syncVariants(clean, variants as never, fm.sku ?? baseSku)
        : undefined,
    });
  };
  const navigate = useNavigate();
  const stock = useProducts(site.id);
  const inventory = useInventoryActions(site.id);
  const editor = can(site, "editor");
  const stockFor = (sku: string) => stock.data?.products.find((p) => p.sku === sku);

  return (
    <>
      <div className="st-ws-cols">
        <MoneyField
          label="Price"
          amount={fm.price?.amount}
          currency={currency}
          error={problems.Price}
          onChange={(p) => {
            if (!p) return;
            // One currency for the product and its variants.
            set({
              price: p,
              compareAtPrice: fm.compareAtPrice
                ? { ...fm.compareAtPrice, currency: p.currency }
                : undefined,
              variants: variants.length
                ? variants.map((v) =>
                    v.price ? { ...v, price: { ...v.price, currency: p.currency } } : v,
                  )
                : undefined,
            });
          }}
        />
        <MoneyField
          label="Compare-at price"
          hint="Shown crossed out, for sales."
          optional
          currencyLocked
          amount={fm.compareAtPrice?.amount}
          currency={currency}
          onChange={(p) => set({ compareAtPrice: p ?? undefined })}
        />
      </div>
      <Field label="SKU" hint="Your own code for this item. Used for stock and orders.">
        <Input
          value={fm.sku ?? ""}
          maxLength={64}
          placeholder={baseSku}
          onChange={(e) => set({ sku: e.target.value })}
        />
      </Field>
      <SwitchRow
        label={<>For sale</>}
        hint={<>Turn off to show it without a buy button.</>}
        checked={fm.available !== false}
        onCheckedChange={(v) => set({ available: v ? undefined : false })}
      />
      <SwitchRow
        label={<>Digital download</>}
        hint={<>Buyers get a download link by email. No shipping.</>}
        checked={Boolean(fm.digital)}
        onCheckedChange={(v) => set({ digital: v || undefined })}
      />
      {fm.digital && (
        <DigitalFile
          site={site}
          sku={fm.sku ?? baseSku}
          hasFile={Boolean(stockFor(fm.sku ?? baseSku)?.hasFile)}
        />
      )}
      {!fm.digital && (
        <Field
          label="Shipping weight"
          hint="In grams, packed. Used for weight-based shipping rates."
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={1_000_000}
            step={1}
            suffix="g"
            aria-label="Shipping weight in grams"
            value={fm.weight ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({
                weight:
                  e.target.value === "" || !Number.isFinite(n)
                    ? undefined
                    : Math.max(0, Math.min(1_000_000, Math.round(n))),
              });
            }}
          />
        </Field>
      )}
      <Field
        label="Sold as"
        hint={
          fm.subscription
            ? "Buyers are charged again every period until they cancel (in Stripe)."
            : "A one-time purchase."
        }
      >
        <Segmented<"once" | "month" | "year">
          aria-label="Sold as"
          size="sm"
          block
          value={fm.subscription?.interval ?? "once"}
          onValueChange={(v) => set({ subscription: v === "once" ? undefined : { interval: v } })}
          options={[
            { value: "once", label: "One-time" },
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
        />
      </Field>
      <ImageList label="Photos" images={fm.images ?? []} onChange={(images) => set({ images })} />

      <fieldset className="st-fieldset">
        <legend>Options</legend>
        <p className="st-ws-hint">
          Sizes, colors or styles. Each combination becomes a variant you can price and stock.
        </p>
        {options.map((o, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: options have no ids
          <div key={i} className="st-option-row">
            <Input
              aria-label={`Option ${i + 1} name`}
              placeholder="Size"
              value={o.name}
              maxLength={40}
              onChange={(e) =>
                setOptions(options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <TagInput
              label={`Option ${i + 1} values`}
              placeholder="Small, Medium…"
              value={o.values}
              onChange={(values) =>
                setOptions(options.map((x, j) => (j === i ? { ...x, values } : x)))
              }
            />
            <IconButton
              size="sm"
              label={`Remove option ${o.name || i + 1}`}
              icon={<Trash2 />}
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {options.length < 3 && (
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => setOptions([...options, { name: "", values: [] }])}
          >
            Add an option
          </Button>
        )}
      </fieldset>

      {variants.length > 0 && (
        <fieldset className="st-fieldset">
          <legend>Variants ({variants.length})</legend>
          <div className="st-variants">
            {variants.map((v, i) => {
              const sku: string = v.sku || `${fm.sku ?? baseSku}#${i}`;
              const s = stockFor(sku);
              const setV = (patch: FM) =>
                set({
                  variants: variants.map((x, j) => {
                    if (j !== i) return x;
                    const next: FM = { ...x, ...patch };
                    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete next[k];
                    return next;
                  }),
                });
              return (
                <div key={variantLabel(v as never)} className="st-variant">
                  <div className="st-variant__head">
                    <strong>{variantLabel(v as never)}</strong>
                    {s?.tracked ? (
                      <Badge tone={s.low ? "pending" : "neutral"}>{s.qty} in stock</Badge>
                    ) : (
                      <Badge>Stock not tracked</Badge>
                    )}
                  </div>
                  <div className="st-ws-cols st-ws-cols--3">
                    <Field label="SKU">
                      <Input
                        value={v.sku ?? ""}
                        placeholder={suggestSku(fm.sku ?? baseSku, v.options)}
                        onChange={(e) => setV({ sku: e.target.value || undefined })}
                      />
                    </Field>
                    <MoneyField
                      label="Price"
                      optional
                      currencyLocked
                      currency={currency}
                      amount={v.price?.amount}
                      onChange={(p) => setV({ price: p ?? undefined })}
                    />
                    <SwitchRow
                      className="st-variant__avail"
                      label={<>For sale</>}
                      checked={v.available !== false}
                      onCheckedChange={(on) => setV({ available: on ? undefined : false })}
                    />
                  </div>
                  <MediaField
                    label="Variant photo"
                    value={v.image}
                    onChange={(src) => setV({ image: src ?? undefined })}
                  />
                  {editor && !s?.tracked && s && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        inventory.set.mutate(
                          { sku, qty: 0 },
                          {
                            onError: (err) =>
                              toast({
                                tone: "danger",
                                title: "Couldn't track stock",
                                description: errorMessage(err),
                              }),
                          },
                        )
                      }
                    >
                      Track stock for this variant
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}
      {editor && (
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowUpRight />}
          onClick={() => navigate(workspacePath(site.id, "products"))}
        >
          Stock levels for every product
        </Button>
      )}
    </>
  );
}

function DigitalFile({ site, sku, hasFile }: { site: Site; sku: string; hasFile: boolean }) {
  const actions = useInventoryActions(site.id);
  const [error, setError] = useState<string | null>(null);
  const designer = can(site, "designer");
  return (
    <Field
      label="Download file"
      hint={
        hasFile
          ? "Uploaded. Buyers get a private link that lasts 7 days."
          : "Up to 100 MB. Kept private until someone buys."
      }
      error={error ?? undefined}
    >
      <div className="st-ws-actions">
        {hasFile && <Badge tone="live">File ready</Badge>}
        {designer ? (
          <label className="st-btnlink">
            <input
              type="file"
              className="st-sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError(null);
                actions.upload.mutate(
                  { sku, file },
                  { onError: (err) => setError(errorMessage(err)) },
                );
              }}
            />
            {actions.upload.isPending ? "Uploading…" : hasFile ? "Replace file" : "Upload file"}
          </label>
        ) : (
          <span className="st-ws-hint">A designer or the owner uploads the file.</span>
        )}
        {hasFile && designer && (
          <Button size="sm" variant="ghost" onClick={() => actions.removeFile.mutate(sku)}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  );
}
