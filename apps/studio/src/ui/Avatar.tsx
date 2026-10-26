import { Avatar as RAvatar } from "radix-ui";
import { cx } from "./cx";
import "./Avatar.css";
import { Tooltip } from "./Tooltip";

export interface Person {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Presence color (cursor + ring). */
  color?: string;
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

const PRESENCE = [
  "#d13438",
  "#c4320a",
  "#0f766e",
  "#3e63dd",
  "#8e4ec6",
  "#c2297f",
  "#2f7d32",
  "#a7650a",
];

/** Stable presence color for a person id. */
export function presenceColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE[h % PRESENCE.length] as string;
}

export interface AvatarProps {
  person: Person;
  size?: number;
  /** Draw a presence ring in the person's color. */
  ring?: boolean;
  className?: string;
}

export function Avatar({ person, size = 24, ring, className }: AvatarProps) {
  const color = person.color ?? presenceColor(person.id);
  return (
    <RAvatar.Root
      className={cx("st-avatar", ring && "st-avatar--ring", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
        ["--_c" as string]: color,
      }}
    >
      {person.avatarUrl && (
        <RAvatar.Image className="st-avatar__img" src={person.avatarUrl} alt={person.name} />
      )}
      <RAvatar.Fallback className="st-avatar__fallback" delayMs={person.avatarUrl ? 400 : 0}>
        <span aria-hidden="true">{initials(person.name)}</span>
        <span className="st-visually-hidden">{person.name}</span>
      </RAvatar.Fallback>
    </RAvatar.Root>
  );
}

export interface AvatarStackProps {
  people: ReadonlyArray<Person>;
  max?: number;
  size?: number;
  /** Accessible summary, e.g. "Also editing". */
  label?: string;
}

/** Overlapping avatars for presence ("who else is here"). */
export function AvatarStack({
  people,
  max = 3,
  size = 24,
  label = "People here",
}: AvatarStackProps) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <ul className="st-avatar-stack" aria-label={label}>
      {shown.map((p) => (
        <li key={p.id}>
          <Tooltip content={p.name}>
            <span tabIndex={-1}>
              <Avatar person={p} size={size} ring />
            </span>
          </Tooltip>
        </li>
      ))}
      {extra > 0 && (
        <li>
          <span
            className="st-avatar st-avatar--more"
            style={{ width: size, height: size }}
            title={people
              .slice(max)
              .map((p) => p.name)
              .join(", ")}
          >
            +{extra}
            <span className="st-visually-hidden"> more</span>
          </span>
        </li>
      )}
    </ul>
  );
}
