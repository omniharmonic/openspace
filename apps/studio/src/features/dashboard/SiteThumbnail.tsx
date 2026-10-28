import type { ImageMap, ResolvedImage } from "@omniharmonic/openspace-renderer";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { useQuery } from "@tanstack/react-query";
import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import { useHub, useSession } from "../../api";
import type { Site } from "../../api/types";

// The renderer and block library load with the first live render, not with the dashboard.
const SiteRender = lazy(() =>
  import("../templates/LiveRender").then((m) => ({ default: m.SiteRender })),
);

/**
 * What the thumbnail's content is keyed by: the commit OpenSpace last put on the live branch
 * (`publishedVersion`, Hub ≥ this release), else the site's last change time. A publish, rollback
 * or finished move gives a new key, so the card re-reads the published document instead of
 * showing a cached (stale) headline. Null when there's nothing published to show yet.
 */
export function thumbnailVersion(site: Site): string | null {
  if (site.status === "building") return null;
  if (site.publishedVersion) return site.publishedVersion;
  if (site.publishedVersion === null) return null;
  // An older Hub that doesn't report versions: its change time is the best key there is.
  return site.updatedAt ?? null;
}

export const thumbnailKey = (siteId: string, version: string) =>
  ["site-thumbnail", siteId, version] as const;

/**
 * Images of the published document: straight from the site's public files at the published
 * commit (no Hub or GitHub API cost; a sha URL never goes stale), or through the Hub's media
 * proxy where those files aren't public (a private site, or a Hub on its dev GitHub emulation).
 */
export function publishedImageMap(
  media: SiteDocument["media"],
  o: { repo: string | null; ref: string; proxy: string | null },
): ImageMap {
  const map: Record<string, ResolvedImage> = {};
  for (const [path, meta] of Object.entries(media)) {
    if (meta.kind !== "image" || !meta.width || !meta.height) continue;
    const src = /^(https?:|data:)/.test(path)
      ? path
      : o.proxy
        ? `${o.proxy}${path}`
        : o.repo
          ? `https://raw.githubusercontent.com/${o.repo}/${o.ref}/${path}`
          : null;
    if (!src) continue;
    map[path] = {
      src,
      width: meta.width,
      height: meta.height,
      ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
    };
  }
  return map;
}

/**
 * A site card's preview: the site's own published home page, rendered live. Falls back to
 * `fallback` (the template's look) until something is published or when the Hub can't send it.
 */
export function SiteThumbnail({
  site,
  aspect,
  fallback,
}: {
  site: Site;
  aspect: number;
  fallback: ReactNode;
}) {
  const hub = useHub();
  const session = useSession();
  const emulated = session.data?.github?.emulated === true;
  const version = thumbnailVersion(site);
  const [wanted, setWanted] = useState(false);
  const published = useQuery({
    queryKey: thumbnailKey(site.id, version ?? ""),
    queryFn: async () => (await hub.getDocument(site.id, { ref: "published" })).document,
    enabled: wanted && version !== null,
    // Keyed by content: a version's document never changes.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const doc = published.data;
  const imageMap = useMemo(() => {
    if (!doc) return undefined;
    const proxy =
      emulated || site.private === true ? (hub.draftMediaBase?.(site.id) ?? null) : null;
    const ref = site.publishedVersion ?? "main";
    return publishedImageMap(doc.media, { repo: site.repo || null, ref, proxy });
  }, [doc, emulated, site.private, site.id, site.repo, site.publishedVersion, hub]);

  if (version === null || published.isError) return <>{fallback}</>;
  return (
    <Suspense fallback={<div className="st-render" style={{ aspectRatio: `${1 / aspect}` }} />}>
      <SiteRender
        // A new version is a new page: remount so the frame never shows the old one.
        key={version}
        doc={doc}
        aspect={aspect}
        imageMap={imageMap}
        title={`Preview of ${site.name}`}
        onVisibleChange={(v) => v && setWanted(true)}
      />
    </Suspense>
  );
}
