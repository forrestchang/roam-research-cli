---
name: roam-research-cli
description: "Read from and write to a Roam Research graph via the `roam` CLI. Use when the user asks to capture a note, search/read pages, list backlinks, manage TODOs, export a page to markdown, upload/fetch/delete files, or run raw Datalog queries against their Roam graph."
---

# Roam Research CLI

The `roam` CLI is installed globally and configured with the user's graph + API token. It wraps three Roam APIs: Backend (Beta), Append, and Desktop Local. Defaults are agent-friendly: single-line JSON to stdout, JSON errors to stderr, distinct exit codes per failure mode. Add `--pretty` to render for humans.

## Core principles

- **Read first, then write.** For destructive operations (`block delete`, `page delete`, `block update`, `file delete`), confirm with the user before running.
- **Prefer high-level commands** (`capture`, `today`, `search`, `outline`, `backlinks`, `tag`, `todo`, `export`, `file`) — they bundle common workflows.
- **Drop to low-level commands** (`query`, `pull`, `block`, `page`, `write`, `append`) only when the high-level ones don't fit.
- **Self-document.** Every subcommand has `--help`. When unsure about a flag, run `roam <cmd> --help`.
- **JSON-first.** Pipe output through `jq` rather than parsing prose; switch to `--pretty` only for human display.

## Quick-reference: which command for which intent

| User intent | Command |
|---|---|
| "Save / capture / jot down ..." | `roam capture "<text>"` |
| "What's on today's daily note?" | `roam today --show` |
| "Search my graph for ..." | `roam search "<query>"` (add `--pages-only` / `--blocks-only`) |
| "Show the outline of <page>" | `roam outline "<page>"` |
| "What links to <page>?" | `roam backlinks "<page>"` |
| "List blocks tagged #X" | `roam tag "<tag>"` |
| "Show / complete a TODO" | `roam todo list` / `roam todo done <uid>` |
| "Export <page> as markdown" | `roam export "<page>" -o page.md` |
| "Upload / fetch / delete a file (image, PDF, ...)" | `roam file <upload\|get\|delete>` |
| "Run this Datalog query" | `roam query '<datalog>'` |
| "Pull this block/page" | `roam pull <eid>` |
| "Create/update/move/delete a block" | `roam block <create|update|move|delete>` |
| "Batch write multiple actions" | `roam write --file actions.json --atomic` |
| "Append to Inbox" (encrypted graph) | `roam append --page "Inbox" --string "..."` |

## Daily Notes Pages (DNPs)

Roam stores DNP uids as `MM-DD-YYYY` (US format). Anywhere a command takes a DNP, pass `--dnp 05-28-2026`, **not** a human-readable title like "May 28th, 2026" — the latter creates a regular page. `roam capture` and `roam today` default to today's DNP automatically.

## Capturing notes

`roam capture` is the most common write. It appends under a configurable header on today's DNP and works on encrypted graphs (uses the Append API).

```bash
roam capture "interesting paper to read"
roam capture --dnp 05-30-2026 "scheduled thought"
roam capture --nest-under "Captures from [[agent]]" "..."
```

Set a default header once: `roam config set --capture-header "Captures from [[CLI]]"`.

## Search workflow

`roam search` does case-insensitive substring matching on page titles and block strings. For "find me the page about X" use it; for structured queries use `roam query`.

```bash
roam search "neural"
roam search "neural" --blocks-only --limit 20
roam search "TODO" --pages-only
```

## Reading pages

- `roam outline "<page>"` — indented markdown tree (best for terminal display).
- `roam export "<page>" -o page.md` — markdown file (best for piping into other tools or saving).
- `roam pull <uid>` — raw JSON (use when you need block metadata, refs, etc.).

## Raw Datalog

```bash
roam query '[:find ?t :where [?p :node/title ?t]]'
roam query --file my-query.edn --arg "Project"
roam pull-many --uids abc123,def456 --pattern '[*]'
```

## Mutations (be deliberate)

`block create / update / move / delete` and `page create / update / delete` are the granular write surface. For multi-step or atomic operations, batch them in `roam write`:

```bash
roam write --file actions.json --atomic
```

`--atomic` makes the whole batch a single transaction; on failure the error response includes `num-actions-successfully-transacted-before-failure`. Before deleting anything, run a `pull` or `outline` first so the user can confirm the target.

## Append API (encrypted graphs, append-only tokens)

The Backend write endpoints don't work on encrypted graphs. The Append API does:

```bash
roam append --page "Inbox" --string "captured idea"
roam append --dnp 05-28-2026 --nest-under "Captures from [[CLI]]" --string "..."
roam append --page "Inbox" --data '[{"string":"parent","children":[{"string":"child"}]}]'
```

Server limits: 200 KB per request, 30 req/min, 20 MB/h. `429` responses include `retry-after-seconds`.

## Files (`roam file upload | get | delete`)

Upload, fetch, or delete files (images, PDFs, etc.) hosted on Roam. File operations are **only** available via the Desktop Local API, so the Roam desktop app must be running and you need a separate **Local API token** — distinct from the backend graph token used by all other commands.

```bash
# One-time setup (token starts with 'roam-graph-local-token-', created in
# Roam Desktop -> Settings -> Graph -> Local API Tokens)
roam config set --local-token roam-graph-local-token-xxxxxxxx
# or, per-invocation:
export ROAM_LOCAL_API_TOKEN=roam-graph-local-token-xxxxxxxx
```

```bash
# Upload a local file -> returns the Firebase storage URL (as `![](URL)` markdown)
roam file upload --file ./screenshot.png

# Upload by fetching a remote URL
roam file upload --url https://example.com/diagram.svg

# Inline it into a block (the upload URL embeds directly as an image)
URL=$(roam file upload --file ./pic.png | jq -r .url)
roam capture "Pic of the day: ![]($URL)"

# Fetch a Roam-hosted file by URL; pass -o to write bytes to disk (images/PDFs)
roam file get "https://firebasestorage.googleapis.com/..." -o ./local.png

# Delete a Roam-hosted file by URL — confirm with the user first
roam file delete "https://firebasestorage.googleapis.com/..."
```

Implementation note: this wraps the official `@roam-research/roam-tools-core` + `-local` packages, so MIME-type detection, base64 handling, and the markdown-wrapped response parsing match Roam-published behavior. You don't have to pre-detect MIME — the CLI handles it.

Common pitfall: if `roam file *` errors with a connection refused / Local API not reachable, the desktop app isn't running (or Local API is disabled). Ask the user to open Roam Desktop and enable the Local API in Settings -> Graph.

## Desktop Local API (general)

If the user runs Roam Desktop with the local HTTP server enabled (`localhost:3333`), `roam local *` calls hit the local process instead of the cloud:

```bash
roam local discover
roam local graphs --available
roam local query '...'
roam local pull <uid> --selector '[:block/string]'
roam local invoke util.generate-uid
```

Newer Roam Desktop versions require a separate **local API token** for `data.*` mutations (the same `--local-token` / `ROAM_LOCAL_API_TOKEN` / `roam config set --local-token` plumbing used by `roam file *`). Read-only calls still work without it.

## Exit codes

| code | meaning |
|---|---|
| 0 | success |
| 1 | local error (args, JSON parse) |
| 2 | other 4XX |
| 3 | 401/403 auth |
| 4 | 413 payload too large |
| 5 | 429 rate limited (read `retry-after-seconds`) |
| 6 | 5XX server error |

Errors go to stderr as JSON: `{error, status, endpoint, ...}`.

## Configuration

Token + graph resolution order (highest priority first):
1. CLI flag (`--token`, `--graph`, `--local-token`)
2. Env vars (`ROAM_API_TOKEN`, `ROAM_GRAPH`, `ROAM_LOCAL_API_TOKEN`)
3. Config file (`~/.config/roam-cli/config.json`)

The user's backend token and default graph are already set. Verify with `roam config show`. **Never print the raw token.** `roam config show` masks both `token` and `localToken` as `***`.

`roam config set` accepts `--token`, `--graph`, `--capture-header`, and `--local-token` in any combination.

## Agent tips

- After any non-trivial write, run a quick `roam pull <uid>` or `roam outline <page>` to confirm the result before reporting back.
- When chaining multiple writes, prefer `roam write --atomic` over a sequence of `block create` calls — atomic gives an all-or-nothing guarantee.
- For interactive sessions, default to `--pretty` for display but keep raw JSON when piping.
- Don't fabricate UIDs. Always `search` / `pull` / `query` to obtain a real UID before writing against it.
- For file uploads, capture the returned URL into a variable (`URL=$(roam file upload ... | jq -r .url)`) before embedding it into a block — the URL is the only handle you'll have for `file get` / `file delete` later.
