# roam-research-cli

A command-line wrapper for the Roam Research APIs, optimised for AI agents and shell pipelines.

Covers all three public surfaces:

It exposes two layers:

- **High-level commands** (`capture`, `today`, `search`, `outline`, `backlinks`, `todo`, `tag`, `export`, `file`) for the everyday workflows you don't want to keep re-writing as Datalog.
- **Low-level primitives** (`query`, `pull`, `pull-many`, `block`, `page`, `write`, `append`, `local`) that map 1:1 onto Roam's three public APIs:

| API | Base URL | What it's for | Commands |
|---|---|---|---|
| **Backend API (Beta)** | `https://api.roamresearch.com` | Read + edit on non-encrypted hosted graphs | `query`, `pull`, `pull-many`, `block`, `page`, `write` |
| **Append API** | `https://append-api.roamresearch.com` | Append-only capture, works with encrypted graphs and append-only tokens | `append`, `capture` |
| **Desktop Local API** | `http://localhost:3333` | Full Roam Alpha API from your machine (separate local-API token, requires desktop app) | `local` |

Output is single-line JSON by default so it composes cleanly with `jq` and LLM tool-calls. Pass `--pretty` for human reading.

## Install

```bash
npm install
npm run build
npm link        # makes the `roam` binary available globally
```

Requires Node.js ≥ 18.

## Configure

Get an API token from your graph's **Settings → Graph → API tokens** (the token starts with `roam-graph-token-`):

```bash
roam config set --token roam-graph-token-xxxxxxxx --graph my-graph
# or:
export ROAM_API_TOKEN=roam-graph-token-xxxxxxxx
export ROAM_GRAPH=my-graph
# or per-invocation:
roam --token roam-graph-token-xxxxxxxx --graph my-graph query '[:find ...]'
```

Precedence: CLI flag → env var → config file (`~/.config/roam-cli/config.json`, `chmod 600`).

Optional: customise the `capture` header used to group quick notes under today's DNP.

```bash
roam config set --capture-header "Captures from [[my-agent]]"
```

## High-level commands

These are the ones an AI agent (or a human) will reach for most. All output is JSON by default; use `--pretty` for human-readable form, or pass specific flags (e.g. `today --show`, `outline`, `export`) for markdown.

### `roam capture <text...>`

Append a quick note under today's DNP, grouped under a configurable header. Works on encrypted graphs (uses the Append API).

```bash
roam capture "interesting paper to read"
roam capture "first" "second"                       # two sibling blocks
roam capture --dnp 05-30-2026 "scheduled thought"
roam capture --page "Inbox" "captured idea"          # target a regular page
roam capture --no-header "no nest-under, top-level"
roam capture --header "Today's Captures" "..."       # one-off header override
```

The default header is `Captures from [[CLI]]` (override with `roam config set --capture-header`).

### `roam today`

```bash
roam today                # {dnp, title, uid, exists} as JSON
roam today --uid          # just '05-27-2026' — no API call
roam today --show         # print full DNP outline as markdown
roam today --date 05-30-2026 --show
```

In Roam, the DNP uid IS the `MM-DD-YYYY` string, so `--uid` is computed locally.

### `roam search <query>`

Case-insensitive substring search across page titles and block strings.

```bash
roam search "neural"                       # pages + blocks
roam search "neural" --pages-only
roam search "neural" --blocks-only --limit 20
```

Each block hit includes the parent page (`page`, `page_uid`) so an agent can navigate.

### `roam outline <page>`

Print any page or block subtree as indented markdown. Auto-detects whether the arg is a page title or a UID; force with `--by title|uid`.

```bash
roam outline "My Project"
roam outline abc123uid
roam outline "My Project" --json --pretty    # raw pulled tree
```

### `roam backlinks <page>` (alias `refs`)

List linked references to a page (matches both `[[page]]` and `#page`).

```bash
roam backlinks "TODO" --limit 20
```

### `roam todo list | done | reopen`

```bash
roam todo list                              # all TODOs in the graph
roam todo list --page "My Project"
roam todo done <block-uid>                  # {{[[TODO]]}} → {{[[DONE]]}}
roam todo reopen <block-uid>                # the inverse
```

### `roam tag <tag>`

Same data shape as `backlinks` but reads as "find all blocks tagged X". `#foo` and `[[foo]]` are identical at the data layer.

```bash
roam tag "research" --limit 50
roam tag "research" --count
```

### `roam file upload | get | delete`

Upload, fetch, or delete files (images, PDFs, etc.) hosted on Roam. This is the only file API Roam exposes, and it lives on the **Desktop Local API** — so the desktop app must be running and you need a separate **Local API token** (different from the backend graph token):

```bash
# One-time setup
roam config set --local-token roam-graph-local-token-xxxxxxxx
# or:
export ROAM_LOCAL_API_TOKEN=roam-graph-local-token-xxxxxxxx
```

Create that token in Roam Desktop → **Settings → Graph → Local API Tokens**.

```bash
# Upload a local file (returns the Firebase storage URL)
roam file upload --file ./screenshot.png

# Upload a file fetched from a remote URL
roam file upload --url https://example.com/diagram.svg

# Use the URL inline in a block (it's a normal `![](URL)` markdown image)
URL=$(roam file upload --file ./pic.png | jq -r .url)
roam capture "Pic of the day: ![]($URL)"

# Fetch a Roam-hosted file by URL (write bytes to disk with --output)
roam file get "https://firebasestorage.googleapis.com/..." -o ./local.png

# Delete a Roam-hosted file by URL
roam file delete "https://firebasestorage.googleapis.com/..."
```

Implementation: this command wraps the official `@roam-research/roam-tools-core` / `-local` packages, so MIME-type detection, base64 handling, and the markdown-wrapper response parsing all match the Roam-published behavior.

### `roam export <page>`

Export a page (or any subtree) to markdown.

```bash
roam export "My Project"                    # → stdout
roam export "My Project" -o project.md      # → file
roam export abc123uid                       # works on any block subtree
```

## Low-level commands

The shortcuts above are built on these. Reach for them when you need the raw API surface (custom Datalog, batch writes, view-type tweaks, etc.).

## Backend API commands

### `roam query <datalog>` (alias `q`)

```bash
roam query '[:find ?title :where [?p :node/title ?title]]'
roam query --file my-query.edn
roam q '[:find ?t :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?t]]' --arg abc123uid
```

### `roam pull <eid>` / `roam pull-many <eid...>`

`<eid>` accepts a numeric EID, a `[":block/uid", "..."]` lookup-ref string, or a bare UID (auto-wrapped as `:block/uid`).

```bash
roam pull abc123uid
roam pull abc123uid --selector '[:block/string {:block/children ...}]'
roam pull-many uid1 uid2 uid3
```

### `roam block create | update | move | delete`

`create` and `move` accept one of `--parent <uid>`, `--page-title <title>`, or `--dnp <MM-DD-YYYY>`. **Always use `--dnp` for Daily Notes Pages** — passing the human title (e.g. `"May 27th, 2026"`) creates a regular page that does NOT show up in the daily log.

```bash
roam block create --parent abc123uid --string "Hello world"
roam block create --dnp 05-27-2026 --string "Captured at $(date)"
roam block create --page-title "My page" -s "## Heading" --heading 2 --order first
roam block update <uid> --string "Edited" --heading 0
roam block move <uid> --dnp 05-27-2026 --order last
roam block delete <uid>
```

`--order` accepts `first`, `last`, or a non-negative integer.

### `roam page create | update | delete`

```bash
roam page create --title "My new page"
roam page update <page-uid> --title "Renamed" --view document
roam page delete <page-uid>
```

### `roam write` — raw + batch

For anything not covered by shortcuts, or to run multiple actions in one round-trip:

```bash
# Single action
roam write --json '{"action":"create-block","location":{"parent-uid":"abc","order":"last"},"block":{"string":"hi"}}'

# Array → multiple sequential requests (results returned as an array)
roam write --file actions.json

# Array → ONE request, wrapped as batch-actions (atomic-ish: server bails on first failure)
roam write --file actions.json --atomic
```

On a `batch-actions` failure the error JSON on stderr includes `num-actions-successfully-transacted-before-failure`, so you know exactly which action blew up.

## Append API

For capture-style appends. Works with **both encrypted and non-encrypted graphs** and with **append-only tokens**. The token still goes in `--token` / `ROAM_API_TOKEN`.

```bash
# Append a single block to a page (page created if missing)
roam append --page "Inbox" --string "captured idea"

# Multiple sibling blocks
roam append --page "Inbox" -s "first" -s "second"

# Append under a per-tool "capture group" block (created if missing). Great for DNPs.
roam append --dnp 05-27-2026 --nest-under "Captures from [[CLI]]" --string "..."

# Nested children — use --data with a JSON array of blocks
roam append --page "Inbox" --data '[{"string":"parent","children":[{"string":"child"}]}]'

# Append under an existing block (see Append API docs for fragility caveats)
roam append --block <block-uid> --string "child"
```

Limits (enforced server-side): 200 KB per request, 30 req/min, 20 MB/h per token. On 429 the error JSON on stderr includes `retry-after-seconds`.

## Desktop Local API

The desktop app exposes `http://localhost:3333` after enabling it in Settings. No token needed.

```bash
# See what port the desktop app picked + which graph is open
roam local discover

# List graphs open in the app (or all graphs you have access to)
roam local graphs
roam local graphs --available

# Datalog query
roam local query '[:find ?title :where [?e :node/title ?title]]'

# Pull
roam local pull abc123uid --selector '[:block/string]'

# Anything else: invoke any `roamAlphaAPI.<path>` directly
roam local invoke util.generate-uid
roam local invoke data.block.create --args-json '[{"location":{"parent-uid":"abc","order":0},"block":{"string":"Hi"}}]'
```

`local` reads the port + last-opened graph from `~/.roam-local-api.json` and falls back to `http://localhost:3333`. Override with `--local-url`.

> **Auth note:** the public `graphs/open` and `graphs/available` endpoints don't need auth. Newer desktop builds, however, require a **local API token** for the per-graph `data.*` calls — the CLI automatically passes whatever you set via `--token` / `ROAM_API_TOKEN` / `roam config set`. Generate that token from the desktop app's Settings menu (it's separate from the graph API token used by the Backend/Append APIs).

## Errors & exit codes

Errors come out on stderr as JSON with `error`, `status`, `endpoint`, plus `retry-after-seconds` (on 429) and `num-actions-successfully-transacted-before-failure` (on batch-actions failures).

| Exit code | Meaning |
|---|---|
| 0 | success |
| 1 | local/internal error (bad flags, JSON parse, etc.) |
| 2 | API 4XX other than the codes below |
| 3 | 401 / 403 (auth / permission) |
| 4 | 413 (payload too large) |
| 5 | 429 (rate limit — check `retry-after-seconds`) |
| 6 | 5XX (server error) |

## Using with AI agents

Subcommands and flags are stable and self-documenting via `--help`. An agent can discover the full surface area with `roam --help` and `roam <command> --help`. Default output is single-line JSON suitable for piping into `jq` or parsing in an LLM tool-call.

### Skill

The repo ships an agent skill at [`skills/roam-research-cli/SKILL.md`](skills/roam-research-cli/SKILL.md) — a concise prompt that teaches an agent which command to reach for in each situation, the DNP UID quirks, the encrypted-graph append flow, and the exit-code contract.

Install it into a [Multica](https://multica.ai) workspace with:

```bash
multica skill import --url https://github.com/forrestchang/roam-research-cli
```

Or copy `skills/roam-research-cli/SKILL.md` into your own agent harness (e.g. `~/.claude/skills/roam-research-cli/SKILL.md` for Claude Code).

## Development

```bash
npm run dev -- query '[:find ?t :where [?p :node/title ?t]]'
npm run build
```

## License

MIT
