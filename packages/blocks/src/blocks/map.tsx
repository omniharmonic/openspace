import { cx } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";
import { Icon } from "../icons";

/**
 * Map: a static OpenStreetMap view assembled from standard 256px tiles (no API key, no
 * third-party JavaScript), a pin, attribution and an "Open in Maps" link.
 */

const TILE = 256;
/** Viewport in tiles (4 × 3 → 1024 × 768 CSS px at 1×, cropped by the frame's aspect ratio). */
const VIEW_W = 4;
const VIEW_H = 3;

export interface TilePlan {
  zoom: number;
  /** Tiles with their position as a percentage of the viewport. */
  tiles: { x: number; y: number; left: number; top: number; src: string }[];
  /** Tile width/height as a percentage of the viewport. */
  tileW: number;
  tileH: number;
}

/** Fractional tile coordinates for a WGS84 point (Web Mercator, OSM slippy-map scheme). */
export function tileCoords(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const clamped = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clamped * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/** The tiles that cover a VIEW_W × VIEW_H viewport centred on the point. */
/** Default tile host: the OpenStreetMap Foundation's standard tiles. */
export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** An https tile URL template containing `{z}`, `{x}` and `{y}`. */
export const TILE_URL_RE = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/[^\s"'<>]*$/i;

/** The tile host to use: a valid custom template, else OpenStreetMap. The only place tile URLs are built. */
export function tileUrlTemplate(custom: string | undefined): string {
  const t = custom?.trim();
  return t && TILE_URL_RE.test(t) && ["{z}", "{x}", "{y}"].every((p) => t.includes(p))
    ? t
    : OSM_TILE_URL;
}

export function planTiles(
  lat: number,
  lng: number,
  zoom: number,
  template: string = OSM_TILE_URL,
): TilePlan {
  const n = 2 ** zoom;
  const c = tileCoords(lat, lng, zoom);
  const x0 = c.x - VIEW_W / 2;
  const y0 = c.y - VIEW_H / 2;
  const tiles: TilePlan["tiles"] = [];
  for (let ty = Math.floor(y0); ty < y0 + VIEW_H; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(x0); tx < x0 + VIEW_W; tx++) {
      const wrapped = ((tx % n) + n) % n;
      tiles.push({
        x: wrapped,
        y: ty,
        left: ((tx - x0) / VIEW_W) * 100,
        top: ((ty - y0) / VIEW_H) * 100,
        src: template
          .replace("{z}", String(zoom))
          .replace("{x}", String(wrapped))
          .replace("{y}", String(ty)),
      });
    }
  }
  return { zoom, tiles, tileW: 100 / VIEW_W, tileH: 100 / VIEW_H };
}

const pct = (v: number) => `${Math.round(v * 1000) / 1000}%`;

export const mapBlock = defineBlock({
  type: "map",
  version: 1,
  category: "contact",
  label: "Map",
  icon: "map",
  description: "A privacy-friendly OpenStreetMap view with a pin and an 'Open in Maps' link.",
  fields: {
    name: f.text({
      optional: true,
      maxLength: 80,
      default: "Juniper Yoga Studio",
      help: "Place name",
    }),
    address: f.text({
      multiline: true,
      maxLength: 200,
      default: "1420 Pearl Street, Suite 2\nBoulder, CO 80302",
    }),
    latitude: f.number({ min: -85, max: 85, default: 40.0186, step: 0.0001 }),
    longitude: f.number({ min: -180, max: 180, default: -105.2797, step: 0.0001 }),
    zoom: f.number({
      min: 3,
      max: 18,
      integer: true,
      default: 15,
      help: "3 = continent, 18 = street",
    }),
    details: f.text({
      optional: true,
      multiline: true,
      maxLength: 240,
      default:
        "Street parking on 15th. Bike racks by the door. Step-free entrance from the courtyard.",
      help: "Directions, parking, accessibility",
    }),
    linkLabel: f.text({ maxLength: 40, default: "Open in Maps" }),
    tileServer: f.text({
      optional: true,
      maxLength: 300,
      label: "Tile server (advanced)",
      placeholder: OSM_TILE_URL,
      help: "An https tile URL with {z}/{x}/{y}. Leave empty for OpenStreetMap; busy sites should use their own or a commercial tile host.",
    }),
    aspect: f.select({
      options: [
        { value: "16:9", label: "Wide 16:9" },
        { value: "3:2", label: "Landscape 3:2" },
        { value: "4:3", label: "Classic 4:3" },
        { value: "1:1", label: "Square 1:1" },
      ],
      default: "3:2",
    }),
  },
  variants: ["card", "plain", "split"],
  styleSlots: ["colorTheme", "padding", "radius", "border", "shadow", "animation"],
  ai: {
    purpose: "Shows where a place is, with the address and a link to full maps.",
    whenToUse:
      "Contact and visit pages for any business with a physical location. Set latitude/longitude precisely; add parking or access notes in details.",
    avoid:
      "Guessing coordinates — ask the owner or geocode the exact address; maps for online-only businesses.",
  },
  render: ({ fields, variant }) => {
    const plan = planTiles(
      fields.latitude,
      fields.longitude,
      fields.zoom,
      tileUrlTemplate(fields.tileServer),
    );
    const lat = fields.latitude.toFixed(5);
    const lng = fields.longitude.toFixed(5);
    const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${fields.zoom}/${lat}/${lng}`;
    const place = fields.name ?? fields.address.split("\n")[0];
    const lines = fields.address.split("\n").filter(Boolean);
    return (
      <figure className={cx("os-map", `os-map--${variant}`)}>
        <div className="os-map__frame" style={{ "--aspect": fields.aspect.replace(":", " / ") }}>
          <div
            className="os-map__tiles"
            role="img"
            aria-label={`Map showing the location of ${place}`}
          >
            {plan.tiles.map((t) => (
              <img
                key={`${t.x}-${t.y}`}
                src={t.src}
                width={TILE}
                height={TILE}
                alt=""
                loading="lazy"
                decoding="async"
                referrerPolicy="strict-origin-when-cross-origin"
                style={{
                  left: pct(t.left),
                  top: pct(t.top),
                  width: pct(plan.tileW),
                  height: pct(plan.tileH),
                }}
              />
            ))}
          </div>
          <span className="os-map__pin" aria-hidden="true">
            <Icon name="map-pin" size={36} strokeWidth={1.8} />
          </span>
          <small className="os-map__attribution">
            ©{" "}
            <a href="https://www.openstreetmap.org/copyright" rel="noopener" target="_blank">
              OpenStreetMap
            </a>{" "}
            contributors
          </small>
        </div>
        <figcaption className="os-map__info">
          <address className="os-map__address">
            {fields.name ? <strong className="os-map__name">{fields.name}</strong> : null}
            {lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
          {fields.details ? <p className="os-map__details">{fields.details}</p> : null}
          <a className="os-map__link" href={href} rel="noopener" target="_blank">
            {fields.linkLabel}
            <Icon name="arrow-right" size={18} />
          </a>
        </figcaption>
      </figure>
    );
  },
});

export const mapCss = `
.os-map{display:grid;gap:var(--os-space-sm);margin:0}
.os-map__frame{position:relative;overflow:hidden;aspect-ratio:var(--aspect,3 / 2);border-radius:var(--os-radius-card);background:var(--os-color-neutral-100);isolation:isolate}
.os-block.has-radius .os-map__frame{border-radius:var(--radius)}
.os-map__tiles{position:absolute;left:50%;top:50%;translate:-50% -50%;min-width:100%;min-height:100%;aspect-ratio:4 / 3;filter:saturate(0.55) contrast(0.95)}
.os-map__tiles>img{position:absolute;max-width:none;object-fit:cover;user-select:none}
.os-map__pin{position:absolute;left:50%;top:50%;z-index:2;translate:-50% -92%;color:var(--os-color-accent);filter:drop-shadow(0 2px 3px color-mix(in oklab,var(--os-color-neutral-950) 35%,transparent))}
.os-map__pin .os-icon{fill:var(--os-color-background)}
.os-map__attribution{position:absolute;inset-inline-end:0;bottom:0;z-index:2;padding:0.15rem 0.45rem;font-size:0.6875rem;line-height:1.4;background:color-mix(in oklab,var(--os-color-neutral-50) 85%,transparent);color:var(--os-color-neutral-800);border-start-start-radius:var(--os-radius-sm)}
.os-map__attribution a{color:inherit}
@media (max-width:767.98px){.os-map__attribution{font-size:0.75rem;padding:0.3rem 0.6rem}.os-map__attribution a{display:inline-block;padding-block:0.15rem}}
.os-map__info{display:grid;gap:var(--os-space-2xs);align-content:start}
.os-map__address{display:grid;font-style:normal;color:var(--os-color-text)}
.os-map__name{font-family:var(--os-font-heading);font-weight:var(--os-font-weight-heading);font-size:var(--os-type-h4-font-size);line-height:var(--os-type-h4-line-height);color:var(--os-color-heading);margin-bottom:0.15em}
.os-map__details{font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height);color:var(--os-color-text-muted);max-inline-size:var(--os-measure)}
.os-map__link{display:inline-flex;align-items:center;gap:0.35em;justify-self:start;font-weight:var(--os-font-weight-strong)}
.os-map__link .os-icon{transition:translate var(--os-motion-duration-base) var(--os-motion-ease)}
.os-map__link:hover .os-icon{translate:0.2em 0}
.os-map--card{position:relative}
.os-map--card .os-map__info{padding:var(--os-space-sm);background:var(--os-color-surface-raised);border-radius:var(--os-radius-card);box-shadow:var(--os-shadow-md)}
@container block (min-width:40rem){.os-map--card .os-map__info{position:absolute;inset-inline-start:var(--os-space-sm);bottom:var(--os-space-sm);z-index:3;max-width:min(22rem,45%)}.os-map--card .os-map__frame{aspect-ratio:var(--aspect,3 / 2)}}
@container block (min-width:44rem){.os-map--split{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);align-items:center;gap:var(--os-space-md)}}
`;
