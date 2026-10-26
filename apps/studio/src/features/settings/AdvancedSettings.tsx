import { buttonBlock, rt, textBlock } from "@openspace/blocks";
import type { Section } from "@openspace/schema";
import { ArrowUpRight, FileWarning, GitBranch, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { Button, toast } from "../../ui";
import { cloneSection } from "../editor/model/actions";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { createPage } from "../pages/pageOps";
import type { PageTemplate } from "../pages/pageTemplates";
import { useSiteUpdate } from "../site-chrome/controls";
import { can } from "../site-mgmt/manage-ui";
import { CodeEditor } from "./CodeEditor";
import { filesUrl } from "./HomeExplainer";
import { RedirectsManager } from "./RedirectsManager";

export const NOT_FOUND_TEMPLATE: PageTemplate = {
  id: "404",
  label: "Page not found",
  description: "Shown when an address doesn't exist",
  title: "Page not found",
  slug: "404",
  outline: ["text"],
  build: (): Section[] => [
    cloneSection({
      id: "sec_0000000000",
      label: "Not found",
      layout: { mode: "stack", columns: { d: [12], m: [12] }, align: "center" },
      style: { colorTheme: "light" },
      blocks: [
        textBlock.create({
          fields: {
            content: rt.doc(
              rt.h(1, "We couldn’t find that page"),
              rt.p("It may have moved. Try the home page, or the menu above."),
            ),
          },
        }),
        buttonBlock.create({
          fields: { label: "Go to the home page", link: { type: "url", url: "/" } },
        }),
      ],
    } as Section),
  ],
};

function CodeSetting({
  title,
  description,
  value,
  language,
  placeholder,
  onSave,
  warning,
}: {
  title: string;
  description: string;
  value: string;
  language: "css" | "html";
  placeholder: string;
  onSave: (v: string) => boolean;
  warning?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Undo, or a collaborator's change, replaces the draft.
  useEffect(() => setDraft(value), [value]);
  const dirty = draft !== value;
  return (
    <section className="st-card" aria-label={title}>
      <div>
        <h3 className="st-card__title">{title}</h3>
        <p className="st-card__desc">{description}</p>
      </div>
      {warning && (
        <div className="st-callout st-callout--pending" role="note">
          <TriangleAlert aria-hidden="true" />
          <div>{warning}</div>
        </div>
      )}
      <CodeEditor
        value={draft}
        onChange={setDraft}
        language={language}
        label={title}
        placeholder={placeholder}
      />
      <div className="st-row-actions">
        <span className="st-muted-note">{draft.length.toLocaleString()} characters</span>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(value)}>
          Revert
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty}
          onClick={() => onSave(draft) && toast({ tone: "success", title: `${title} saved` })}
        >
          Save
        </Button>
      </div>
    </section>
  );
}

/**
 * Advanced (the one place technical words are allowed, Global Constraint 9): custom CSS,
 * code injection, redirects, the 404 page, where the repository lives, and ejecting.
 */
export function AdvancedSettings({ site }: { site: Site }) {
  const api = useDocStoreApi();
  const navigate = useNavigate();
  const doc = useDocStore((s) => s.doc);
  const update = useSiteUpdate();
  const designer = can(site, "designer");
  const notFound = Object.values(doc.pages).find((p) => p.slug === "404");
  const setCode =
    (key: "customCss" | "headInjection" | "footerInjection", label: string) => (v: string) =>
      update(label, v.trim() ? { set: { [key]: v } } : { unset: [key] });

  return (
    <div className="st-settings__stack">
      <p className="st-settings__lede">
        For people comfortable with code. These settings use technical terms like repository, branch
        and commit.
      </p>

      {designer && (
        <>
          <CodeSetting
            title="Custom CSS"
            description="Added after your Site Styles on every page, and shown on the canvas as you edit. Prefer Site Styles where you can; they stay accessible as styles change."
            value={doc.site.customCss ?? ""}
            language="css"
            placeholder={".os-header { letter-spacing: 0.02em; }"}
            onSave={setCode("customCss", "Custom CSS")}
          />
          <CodeSetting
            title="Code in the page head"
            description="Inserted into <head> on every published page, e.g. a verification tag or an analytics script."
            value={doc.site.headInjection ?? ""}
            language="html"
            placeholder={'<meta name="google-site-verification" content="…">'}
            warning="This code runs on your published site only (never in the editor). A broken or untrusted script can break your site or expose your visitors."
            onSave={setCode("headInjection", "Head code")}
          />
          <CodeSetting
            title="Code before </body>"
            description="Inserted at the end of every published page, e.g. a chat widget."
            value={doc.site.footerInjection ?? ""}
            language="html"
            placeholder={'<script src="https://widget.example.com/chat.js" defer></script>'}
            onSave={setCode("footerInjection", "Footer code")}
          />
        </>
      )}

      <section className="st-card" aria-labelledby="adv-redirects">
        <div>
          <h3 id="adv-redirects" className="st-card__title">
            Redirects
          </h3>
          <p className="st-card__desc">
            Send old addresses to new ones, so links and search results keep working. On Cloudflare
            these are real HTTP redirects; on GitHub Pages a small forwarding page does the job.
          </p>
        </div>
        <RedirectsManager disabled={!can(site, "editor")} />
      </section>

      <section className="st-card" aria-labelledby="adv-404">
        <div className="st-card__head">
          <div>
            <h3 id="adv-404" className="st-card__title">
              <FileWarning aria-hidden="true" className="st-inline-icon" /> 404 page
            </h3>
            <p className="st-card__desc">
              What visitors see at an address that doesn't exist.{" "}
              {notFound
                ? "Design it like any other page."
                : "Without one, a simple page in your styles is used."}
            </p>
          </div>
          {notFound ? (
            <Button
              size="sm"
              onClick={() => {
                api.getState().setPage(notFound.id);
                navigate(`/sites/${site.id}`);
              }}
            >
              Design the 404 page
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const cmd = createPage(doc, NOT_FOUND_TEMPLATE, {
                  title: "Page not found",
                  slug: "404",
                  addToNav: false,
                });
                const page = cmd.bodies[0] as { page: { seo?: object } };
                page.page.seo = { noindex: true };
                const res = api.getState().commit(cmd.bodies, { label: "Add 404 page" });
                if (!res.ok) {
                  toast({
                    tone: "danger",
                    title: "Couldn’t add the page",
                    description: res.errors[0]?.message,
                  });
                  return;
                }
                api.getState().setPage(cmd.pageId);
                navigate(`/sites/${site.id}`);
              }}
            >
              Create a 404 page
            </Button>
          )}
        </div>
      </section>

      <section className="st-card" aria-labelledby="adv-repo">
        <h3 id="adv-repo" className="st-card__title">
          <GitBranch aria-hidden="true" className="st-inline-icon" /> Repository
        </h3>
        <dl className="st-facts">
          <dt>Repository</dt>
          <dd>
            <a href={filesUrl(site)} target="_blank" rel="noreferrer">
              {site.repo} <ArrowUpRight aria-hidden="true" className="st-inline-icon" />
            </a>
          </dd>
          <dt>Drafts</dt>
          <dd>
            Edits are committed to the <code className="st-code">os/draft</code> branch about 10
            seconds after you stop typing.
          </dd>
          <dt>Publishing</dt>
          <dd>
            Publish squashes the draft into one commit on <code className="st-code">main</code>; a
            GitHub Actions workflow builds and deploys it (
            {site.deployTarget === "cloudflare" ? "Cloudflare Workers" : "GitHub Pages"}).
          </dd>
          <dt>Snapshots</dt>
          <dd>
            Named snapshots are tags like <code className="st-code">os/snap/before-redesign</code>.
          </dd>
          <dt>Content</dt>
          <dd>
            Pages are JSON in <code className="st-code">content/pages/</code>, media in{" "}
            <code className="st-code">media/</code>, settings in{" "}
            <code className="st-code">openspace.json</code>.{" "}
            <code className="st-code">AGENTS.md</code> explains the layout to coding agents.
          </dd>
        </dl>
      </section>

      <section className="st-card" aria-labelledby="adv-eject">
        <h3 id="adv-eject" className="st-card__title">
          Eject to a plain Astro project
        </h3>
        <p className="st-card__desc">
          Run <code className="st-code">npx openspace eject</code> in a clone of the repository. It
          copies the site kit's source into the repo and removes the package dependency, so you can
          change anything. Studio stops editing ejected sites; your published site keeps working.
        </p>
      </section>
    </div>
  );
}
