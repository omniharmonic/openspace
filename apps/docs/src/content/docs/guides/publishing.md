---
title: Publishing, history & rollback
description: How drafts, publishing, scheduled publishing, version history, snapshots and one-click rollback work in OpenSpace.
---

## Drafts are private until you publish

Everything you change in Studio is saved to a **draft** — on your device instantly, and to the cloud within seconds. Your live site doesn't change until you press **Publish**. Collaborators and Claude edit the same draft, and you see their changes live.

## Publish

Press **Publish** in the top bar. The dialog summarizes what changed since the live version — "2 pages edited, 3 images added, changed accent color" — and publishes with one click. A progress pill shows *Publishing…*, then *Live* with a link, usually within about a minute.

If there's nothing new, it says *Everything is already live*.

### Schedule a publish

Switch the dialog to **Schedule**, pick a date and time (in your time zone), and OpenSpace publishes then. Pending schedules are listed in the same dialog, where you can cancel them.

### If publishing fails

The pill says *Couldn't publish* and explains why in plain language. Common problems — such as a page pointing at a deleted image — come with a **Fix it for me** button that repairs the change and tries again. As a last resort you can roll back.

### Discard changes

**Discard changes…** (designers and owners) throws away the draft and returns to what's live. It's an ordinary edit, so you can still undo it straight afterwards.

## History

Open **History and versions** from the clock button in the top bar. It has two lists:

- **Published versions** — every publish, newest first, with its summary, date and author. *Live now*, *Rollback* and *Fixed automatically* badges show what happened. **Preview** opens any version in a new tab.
- **Snapshots** — named save points of the draft. Save one yourself before a big change ("Before the redesign"). OpenSpace saves one automatically **before every AI session** and **before every rollback**. Designers and owners can **Restore** a snapshot.

## Roll back

Choose a published version and press **Roll back** (designers and owners). Your live site returns to that version in about a minute. Nothing is lost: rollback adds a new version on top of the history rather than erasing anything, and any unpublished changes are kept in a snapshot first.

## Under the hood

For the curious (Settings → Advanced shows these details): your draft is kept on a draft branch (`os/draft`) of your site's repository; publishing makes one tidy commit on `main` with the change summary as its message, and a GitHub Actions workflow builds and deploys the site. Snapshots are lightweight tags (`os/snap/…`). Rollback is a new commit with the old version's files — history is never rewritten.
