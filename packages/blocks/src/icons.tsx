import {
  Accessibility,
  ArrowRight,
  Award,
  Baby,
  Bed,
  Bike,
  BookOpen,
  Briefcase,
  Brush,
  Building2,
  Cake,
  Calendar,
  Camera,
  Car,
  ChartBar,
  Check,
  Clock,
  Cloud,
  Code,
  Coffee,
  Dog,
  Droplet,
  Dumbbell,
  EighthNotes,
  Eye,
  Feather,
  FileText,
  Flame,
  Flower,
  Gauge,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  HandHeart,
  Handshake,
  Headphones,
  Heart,
  HeartHandshake,
  House,
  type IconNode,
  Image,
  KeyRound,
  Layers,
  Leaf,
  Lightbulb,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Minus,
  Moon,
  Mountain,
  Package,
  Palette,
  PawPrint,
  PenTool,
  Percent,
  Phone,
  Plane,
  Plug,
  Puzzle,
  Recycle,
  Repeat,
  Rocket,
  Ruler,
  Scissors,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Sprout,
  Star,
  Stethoscope,
  Sun,
  Target,
  Tent,
  Ticket,
  Timer,
  TrendingUp,
  Truck,
  User,
  Users,
  Utensils,
  Video,
  WavesHorizontal,
  Wifi,
  Wine,
  Workflow,
  Wrench,
  X,
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
  minus: Minus,
  x: X,
  "trending-up": TrendingUp,
  layers: Layers,
  code: Code,
  plug: Plug,
  headphones: Headphones,
  briefcase: Briefcase,
  droplet: Droplet,
  hammer: Hammer,
  flame: Flame,
  ticket: Ticket,
  mic: Mic,
  "pen-tool": PenTool,
  feather: Feather,
  "chart-bar": ChartBar,
  timer: Timer,
  "hand-heart": HandHeart,
  plane: Plane,
  bed: Bed,
  building: Building2,
  ruler: Ruler,
  search: Search,
  smartphone: Smartphone,
  cloud: Cloud,
  repeat: Repeat,
  percent: Percent,
  handshake: Handshake,
  stethoscope: Stethoscope,
  gauge: Gauge,
  workflow: Workflow,
  puzzle: Puzzle,
  wine: Wine,
  cake: Cake,
  tent: Tent,
  eye: Eye,
  image: Image,
  "file-text": FileText,
  video: Video,
  "key-round": KeyRound,
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
