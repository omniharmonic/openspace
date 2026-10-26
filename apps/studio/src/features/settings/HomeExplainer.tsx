import { ArrowUpRight, Cloud, Database, FolderGit2, LogOut } from "lucide-react";
import { useNavigate } from "react-router";
import type { Site } from "../../api/types";
import { displayUrl } from "../onboarding/BuildingProgress";

/** The site's files on GitHub (the owner's account). */
export function filesUrl(site: Site): string {
  return `https://github.com/${site.repo}`;
}

/**
 * "Your site's home" (PRD §4.6): where everything lives, in plain language. No technical
 * vocabulary here — that's what Advanced is for.
 */
export function HomeExplainer({ site }: { site: Site }) {
  const navigate = useNavigate();
  const cloudflare = site.deployTarget === "cloudflare";
  return (
    <div className="st-settings__stack">
      <p className="st-settings__lede">
        OpenSpace doesn't keep your site locked away. Here's where each part of it lives, so you
        always know you can take it with you.
      </p>
      <ul className="st-home">
        <li className="st-home__item">
          <span className="st-home__icon" aria-hidden="true">
            <FolderGit2 />
          </span>
          <div>
            <h3>Your site's files</h3>
            <p>
              Every page, image and setting is stored in <strong>your own GitHub account</strong>.
              Each time you publish, a new version is saved there, so nothing is ever lost.
            </p>
            <a href={filesUrl(site)} target="_blank" rel="noreferrer" className="st-home__link">
              github.com/{site.repo} <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </li>
        <li className="st-home__item">
          <span className="st-home__icon" aria-hidden="true">
            <Cloud />
          </span>
          <div>
            <h3>Where visitors see it</h3>
            <p>
              Your site is put online by{" "}
              <strong>
                {cloudflare ? "Cloudflare, in your own account" : "GitHub Pages, for free"}
              </strong>
              .
              {cloudflare
                ? " That's what makes your store, member area and password pages work."
                : " If you add a store, member area or password pages, you can switch to Cloudflare (also free) in Hosting."}
            </p>
            <a href={site.url} target="_blank" rel="noreferrer" className="st-home__link">
              {displayUrl(site.url)} <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </li>
        <li className="st-home__item">
          <span className="st-home__icon" aria-hidden="true">
            <Database />
          </span>
          <div>
            <h3>Your visitors' messages</h3>
            <p>
              Form entries, newsletter subscribers, members and orders are kept by{" "}
              <strong>OpenSpace</strong>, because a website can't hold them by itself. You can
              download all of it at any time.
            </p>
            <button
              type="button"
              className="st-linklike st-home__link"
              onClick={() => navigate(`/sites/${site.id}/settings/export`)}
            >
              Export your data
            </button>
          </div>
        </li>
        <li className="st-home__item">
          <span className="st-home__icon" aria-hidden="true">
            <LogOut />
          </span>
          <div>
            <h3>You can leave and keep everything</h3>
            <p>
              If you stop using OpenSpace, your site keeps working from your GitHub account, and
              your files stay yours. Download your data first, then delete the site here.
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}
