# @openspace/cli

The `openspace` command line: `check`, `dev`, `migrate`, `new`, `eject`, `agents-md` and `mcp`.

## `openspace mcp [dir]` — let Claude edit and design your site

Runs the OpenSpace MCP server over stdio against a local site folder (default: the current
folder). It is the same tool set the Hub serves remotely: typed, validated edits (every change is
an `@openspace/ops` operation checked against the schema), section presets, Site Styles,
Design check, page rendering and screenshots.

### Claude Code

Add a `.mcp.json` to the site folder (or run `claude mcp add openspace -- npx openspace mcp`):

```json
{
  "mcpServers": {
    "openspace": {
      "command": "npx",
      "args": ["openspace", "mcp", "."]
    }
  }
}
```

For unattended or autonomous runs (scheduled jobs, agents working without you watching), add
`--no-publish` to the args so the connection can edit the draft but never commit or roll back:
`"args": ["openspace", "mcp", ".", "--no-publish"]`.

Options:

| Option               | Effect                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| `--no-publish`       | Hide publishing from this connection (the `publish`/`rollback` tools refuse). |
| `--no-screenshots`   | Don't start a browser for the `screenshot` tool.                              |
| `--preview-port <n>` | Fixed port for the local preview server (default: random, `127.0.0.1` only).  |

### What happens to your files

- Edits are written straight to `content/` and `media/` through the same loader/writer the site
  build uses, so unchanged files are never rewritten. Agents can't write `src/`, workflows or
  `openspace.json` (no agent path ever rewrites it, not even discard or rollback), and can't
  change custom code (custom CSS, head/footer injection). Discard and rollback are replayed as
  validated operations, like any other edit.
- **With git**, the draft is your working tree and the published version is `HEAD`:
  - before Claude's first edit in a session, a snapshot tag `os/snap/agent-<time>` records the
    working tree (made from a temporary index — your index and branch are untouched), so
    `git checkout os/snap/agent-… -- content media` undoes everything Claude did;
  - `publish` (only with `confirm: true`) commits `content/` and `media/` on the current branch
    with a summary message; push to deploy;
  - `discard_draft` and `rollback` take a snapshot first (`os/snap/before-discard-…`,
    `os/snap/before-rollback-…`).
- **Without git**, edits are saved to the files and there is no publish step.

### Screenshots and preview

`preview` starts a small preview server on `127.0.0.1` (it only answers requests addressed to
`127.0.0.1`/`localhost`, and serves files only from `media/`) that renders the current files with the
real renderer. `screenshot` captures a page or one section at desktop (1440), tablet (834) or
mobile (390) width when Playwright is installed:

```sh
npm i -D playwright
npx playwright install chromium   # or have Google Chrome installed
```

Without Playwright, `screenshot` explains how to enable it and `render_page` still returns the
rendered HTML. Uploads larger than 2400 px are resized when `sharp` is installed; otherwise they
are refused with a message.

### A good first prompt

> Read openspace://guidance/design, then use the `iterate-design` prompt on the home page:
> make the hero stronger and check it on mobile.
