import {
  Accessibility,
  ArrowRight,
  Award,
  Baby,
  Bike,
  BookOpen,
  Brush,
  Calendar,
  Camera,
  Car,
  Check,
  Clock,
  Coffee,
  Dog,
  Dumbbell,
  EighthNotes,
  Flower,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  HeartHandshake,
  House,
  type IconNode,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Mountain,
  Package,
  Palette,
  PawPrint,
  Phone,
  Recycle,
  Rocket,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Truck,
  User,
  Users,
  Utensils,
  WavesHorizontal,
  Wifi,
  Wrench,
  Zap,
} from "lucide";
import { createElement } from "react";

/**
 * The inline SVG icon set for icon lists and cards (Lucide, ISC license). Icons are rendered
 * server-side as inline `<svg>` that inherits `currentColor`; no icon font, no client JS.
 */
const SET = {
  check: Check,
  star: Star,
  heart: Heart,
  leaf: Leaf,
  sprout: Sprout,
  flower: Flower,
  sun: Sun,
  moon: Moon,
  sparkles: Sparkles,
  mountain: Mountain,
  waves: WavesHorizontal,
  "map-pin": MapPin,
  phone: Phone,
  mail: Mail,
  "message-circle": MessageCircle,
  clock: Clock,
  calendar: Calendar,
  coffee: Coffee,
  utensils: Utensils,
  music: EighthNotes,
  camera: Camera,
  palette: Palette,
  brush: Brush,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  user: User,
  users: Users,
  "heart-handshake": HeartHandshake,
  home: House,
  "shield-check": ShieldCheck,
  lock: Lock,
  award: Award,
  target: Target,
  lightbulb: Lightbulb,
  zap: Zap,
  rocket: Rocket,
  gift: Gift,
  "shopping-bag": ShoppingBag,
  package: Package,
  truck: Truck,
  recycle: Recycle,
  globe: Globe,
  wifi: Wifi,
  car: Car,
  bike: Bike,
  dumbbell: Dumbbell,
  accessibility: Accessibility,
  baby: Baby,
  dog: Dog,
  "paw-print": PawPrint,
  scissors: Scissors,
  wrench: Wrench,
  "arrow-right": ArrowRight,
} as const satisfies Record<string, IconNode>;

export type IconName = keyof typeof SET;
export const ICON_NAMES = Object.keys(SET) as IconName[];

/** Select options for icon fields (`map-pin` → "Map pin"). */
export const ICON_OPTIONS = ICON_NAMES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " "),
}));

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Accessible label; omitted icons are decorative (`aria-hidden`). */
  label?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, className, label, strokeWidth = 1.6 }: IconProps) {
  const node = SET[name] ?? SET.check;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative (aria-hidden) unless labelled via aria-label
    <svg
      className={className ? `os-icon ${className}` : "os-icon"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {node.map(([tag, attrs], i) =>
        createElement(tag, {
          key: i,
          ...Object.fromEntries(Object.entries(attrs).map(([k, v]) => [camel(k), v])),
        }),
      )}
    </svg>
  );
}
