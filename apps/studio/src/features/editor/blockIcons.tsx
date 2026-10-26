import { blocksRegistry } from "@openspace/blocks";
import {
  AtSign,
  Box,
  ClipboardList,
  CodeXml,
  Columns3,
  GalleryHorizontal,
  Image,
  Images,
  ListChecks,
  ListCollapse,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  MessageSquareQuote,
  Minus,
  MousePointerClick,
  MoveVertical,
  Play,
  Quote,
  Shapes,
  Share2,
  SquareChartGantt,
  Type,
} from "lucide-react";

/** Lucide icons named by block definitions (only the ones the library uses, to keep the bundle small). */
const ICONS: Record<string, LucideIcon> = {
  "at-sign": AtSign,
  "clipboard-list": ClipboardList,
  "code-xml": CodeXml,
  "columns-3": Columns3,
  "gallery-horizontal": GalleryHorizontal,
  image: Image,
  images: Images,
  "list-checks": ListChecks,
  "list-collapse": ListCollapse,
  mail: Mail,
  map: MapIcon,
  "message-square-quote": MessageSquareQuote,
  minus: Minus,
  "mouse-pointer-click": MousePointerClick,
  "move-vertical": MoveVertical,
  play: Play,
  quote: Quote,
  shapes: Shapes,
  "share-2": Share2,
  "square-chart-gantt": SquareChartGantt,
  type: Type,
};

export function BlockIcon({ type, className }: { type: string; className?: string }) {
  const name = blocksRegistry().get(type)?.icon;
  const Icon = (name && ICONS[name]) || Box;
  return <Icon className={className} aria-hidden="true" />;
}
