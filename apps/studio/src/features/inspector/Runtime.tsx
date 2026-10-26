import { lazy, Suspense, useEffect, useState } from "react";
import { BlockMenu } from "../add-section/BlockMenu";
import { useAddSection } from "../add-section/blockMenuStore";
import { useDocStore } from "../editor/model/context";
import { useRole } from "../sync/PublishFlow";
import { useSiteRoleStore } from "./env";
import { FallbackMediaPicker } from "./media";

const AddSectionDialog = lazy(() =>
  import("../add-section/AddSection").then((m) => ({ default: m.AddSectionDialog })),
);

/**
 * Editor-wide pieces of the inspector work, mounted once inside the editor: publishes the
 * person's role (from the site record) and hosts the block menu, the add-section gallery
 * dialog and the fallback media picker.
 */
export function InspectorRuntime() {
  const role = useRole();
  const doc = useDocStore((s) => s.doc);
  // The gallery dialog (and the preset library) loads the first time a "+" is used.
  const galleryOpen = useAddSection((s) => s.open);
  const [galleryUsed, setGalleryUsed] = useState(false);
  useEffect(() => {
    if (galleryOpen) setGalleryUsed(true);
  }, [galleryOpen]);
  useEffect(() => {
    useSiteRoleStore.setState({ role });
    return () => useSiteRoleStore.setState({ role: undefined });
  }, [role]);
  return (
    <>
      <BlockMenu />
      {(galleryUsed || galleryOpen) && (
        <Suspense fallback={null}>
          <AddSectionDialog />
        </Suspense>
      )}
      <FallbackMediaPicker doc={doc} />
    </>
  );
}
