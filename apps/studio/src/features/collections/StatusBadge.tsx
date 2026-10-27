import type { CollectionItem } from "@omniharmonic/openspace-schema";
import { Badge } from "../../ui";
import { date } from "../workspace/format";
import { effectiveStatus } from "./itemOps";

export function StatusBadge({ item }: { item: CollectionItem }) {
  const s = effectiveStatus(item);
  if (s === "published")
    return (
      <Badge tone="live" dot>
        Published
      </Badge>
    );
  if (s === "scheduled")
    return (
      <Badge tone="accent" dot title={item.frontmatter.publishAt ?? undefined}>
        Scheduled
        {item.frontmatter.publishAt
          ? ` · ${date(item.frontmatter.publishAt, { day: "numeric", month: "short" })}`
          : ""}
      </Badge>
    );
  return <Badge tone="neutral">Draft</Badge>;
}
