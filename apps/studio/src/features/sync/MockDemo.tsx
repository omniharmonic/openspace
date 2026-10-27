import type { OpBody } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { CloudOff, Sparkles } from "lucide-react";
import type { MockHub } from "../../api/mock";
import { useRegisterCommands } from "../../ui";
import { useSync } from "./SyncContext";

const LINES = ["Classes for every body", "Come as you are", "Your first class is on us"];

/**
 * ⌘K demo commands in `VITE_MOCK_API` mode only: let "Claude" edit the page through the mock
 * draft room, or take the mock Hub offline, so the live sync UI can be tried without a Hub.
 */
function MockDemoCommands({ hub }: { hub: MockHub }) {
  const { site, store } = useSync();
  useRegisterCommands("mock-demo", [
    {
      id: "demo-agent",
      label: "Demo: let Claude edit this page",
      group: "Demo",
      icon: <Sparkles />,
      run: () => {
        const s = store.getState();
        const page = s.doc.pages[s.pageId as keyof SiteDocument["pages"]];
        const targets = (page?.sections ?? [])
          .flatMap((sec) => sec.blocks)
          .filter(
            (b) =>
              typeof (b.fields as Record<string, unknown>).label === "string" ||
              typeof (b.fields as Record<string, unknown>).heading === "string",
          )
          .slice(0, LINES.length);
        const agent = hub.room(site.id).startAgent({ userId: "demo", name: "You" }, "Claude");
        targets.forEach((b, i) => {
          const key =
            typeof (b.fields as Record<string, unknown>).label === "string" ? "label" : "heading";
          setTimeout(
            () =>
              agent.edit([
                {
                  op: "block.update",
                  page: s.pageId,
                  block: b.id,
                  set: { [key]: LINES[i] },
                } as OpBody,
              ]),
            700 * (i + 1),
          );
        });
      },
    },
    {
      id: "demo-offline",
      label: hub.room(site.id).down
        ? "Demo: bring OpenSpace back online"
        : "Demo: take OpenSpace offline",
      group: "Demo",
      icon: <CloudOff />,
      run: () => {
        const room = hub.room(site.id);
        room.setDown(!room.down);
      },
    },
  ]);
  return null;
}

export function MockDemo() {
  const { hub } = useSync();
  if (hub.kind !== "mock") return null;
  return <MockDemoCommands hub={hub as MockHub} />;
}
