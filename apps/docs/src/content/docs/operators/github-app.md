---
title: GitHub App settings
description: The GitHub App settings a Hub needs so new people are guided through installing it — Setup URL, redirect on update, callback, webhook, permissions and events.
---

This page is for people who **run an OpenSpace Hub**. Every site's files live in a repository in the owner's own GitHub account, and the Hub creates and updates that repository through your **GitHub App**. Signing in with GitHub is not enough on its own: the App must also be **installed** on the account (with access to **all repositories**, because a new site's repository doesn't exist yet when the person installs it).

Studio guides people through that install: after sign-in, a site that can't be created yet shows *"One more step: let OpenSpace save your site"* with a **Continue to GitHub** button. GitHub then sends the person back to the Hub's **Setup URL**, which checks the installation belongs to them and finishes creating the site. For that round trip to work, set these in GitHub → Settings → Developer settings → GitHub Apps → *your App* → **General** (replace `hub.openspace.host` with your Hub's address):

| Setting | Value |
|---|---|
| **Callback URL** | `https://hub.openspace.host/auth/github/callback` |
| **Expire user authorization tokens** | On |
| **Request user authorization (OAuth) during installation** | **Off** — when on, GitHub hides the Setup URL and sends installs to the callback instead. (The Hub copes with that too, but the Setup URL is the supported path.) |
| **Setup URL** | `https://hub.openspace.host/auth/github/installed` |
| **Redirect on update** | **On** — so changing an installation from "Only select repositories" to "All repositories" also comes back to the Hub and resumes setup. |
| **Webhook → Active** | On |
| **Webhook URL** | `https://hub.openspace.host/webhooks/github` |
| **Webhook secret** | The same value as the Hub's `GITHUB_WEBHOOK_SECRET` secret. |
| **Where can this GitHub App be installed?** | **Any account** (a public App), so everyone can install it on their own account or organization. |

**Repository permissions** (read & write): Administration, Contents, Pages, Pull requests, Secrets, Variables, Workflows. **Read-only**: Actions, Metadata. **Account permissions**: Email addresses — read.

**Subscribe to events**: Installation target, Meta, Pull request, Push, Repository, Workflow run. (The `installation` and installation repositories events are always sent to GitHub Apps.)

The Hub's `GITHUB_APP_SLUG` variable must be the App's slug — the last part of `https://github.com/apps/<slug>` — because the install link is `https://github.com/apps/<slug>/installations/new`.

## What people see

1. **Sign in with GitHub** (the Callback URL).
2. If the App isn't installed on their account yet, Studio shows one plain-language screen and **Continue to GitHub**. GitHub's install page opens with their account already chosen (GitHub preselects it).
3. They keep **All repositories** and choose **Install**. GitHub redirects to the Setup URL with the installation and the one-time code (state) the Hub sent; the Hub verifies the installation through the person's own GitHub token and creates the site. They land in the editor while it publishes.

Other cases the Hub handles:

- **"Only select repositories"** — the site waits; **Connect GitHub** opens the installation's settings, where they switch to **All repositories** and save (needs *Redirect on update*).
- **Organizations** — a member who isn't an organization owner can only *request* the install; GitHub reports a request and the site shows "Waiting for your organization". Once an owner approves, **Try again** finishes it.
- **Cancelled** — GitHub doesn't redirect; the site stays in "One more step" on the dashboard until they continue.
- **Uninstalled later** — the `installation.deleted` webhook (and repositories removed from an installation) put the person's sites into **Reconnect GitHub**; the live site stays online, and reconnecting restores editing and publishing.
