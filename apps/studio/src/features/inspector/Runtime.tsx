import { useEffect } from "react";
import { AddSectionDialog } from "../add-section/AddSection";
import { BlockMenu } from "../add-section/BlockMenu";
import { useDocStore } from "../editor/model/context";
import { useRole } from "../sync/PublishFlow";
import { useSiteRoleStore } from "./env";
import { FallbackMediaPicker } from "./media";

/**
 * Editor-wide pieces of the inspector work, mounted once inside the editor: publishes the
 * person's role (from the site record) and hosts the block menu, the add-section gallery
 * dialog and the fallback media picker.
 */
export function InspectorRuntime() {
  const role = useRole();
  const doc = useDocStore((s) => s.doc);
  useEffect(() => {
    useSiteRoleStore.setState({ role });
    return () => useSiteRoleStore.setState({ role: undefined });
  }, [role]);
  return (
    <>
      <BlockMenu />
      <AddSectionDialog />
      <FallbackMediaPicker doc={doc} />
    </>
  );
}
