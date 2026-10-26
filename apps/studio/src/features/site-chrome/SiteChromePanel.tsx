import { useState } from "react";
import { Tabs } from "../../ui";
import { AnnouncementEditor, PopupEditor } from "./BannerEditors";
import { FooterEditor } from "./FooterEditor";
import { HeaderBuilder } from "./HeaderBuilder";
import "./site-chrome.css";

export type ChromeTab = "header" | "footer" | "announcement" | "popup";

/** Left panel: header builder, footer, announcement bar and pop-up. */
export function SiteChromePanel({ initial = "header" }: { initial?: ChromeTab }) {
  const [tab, setTab] = useState<ChromeTab>(initial);
  return (
    <Tabs<ChromeTab>
      className="st-chrome-tabs"
      aria-label="Header and footer"
      value={tab}
      onValueChange={setTab}
      items={[
        { value: "header", label: "Header", content: <HeaderBuilder /> },
        { value: "footer", label: "Footer", content: <FooterEditor /> },
        { value: "announcement", label: "Banner", content: <AnnouncementEditor /> },
        { value: "popup", label: "Pop-up", content: <PopupEditor /> },
      ]}
    />
  );
}
