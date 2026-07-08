# Landed

A local-first job-search command center. It unifies the whole pipeline — discovery,
fit assessment, résumé tailoring, applications, interviews, and prep — into one
stage-aware view, and pairs with **Claude CoWork** (an agent working over MCP) to do
the heavy lifting: assessing job fit, tailoring résumés, and reconciling your inbox.

Everything runs on your machine. A single SQLite database is the source of truth; the
app and the agent both read and write it — the app through its UI, the agent through an
MCP server.

> Built with Next.js 16 (App Router), React 19, Tailwind 4, Drizzle ORM, and
> `better-sqlite3`. Two actors edit the data: **You** (the human, via the UI) and
> **CoWork** (the agent, via MCP) — every change is attributed to one of them.

## Features

- **Unified pipeline** — one stage-aware board from discovery → fit → tailor →
  apply → interview → closed, with per-stage actions.
- **Fit assessment & résumé tailoring** — queue a posting and hand it to CoWork; it
  assesses fit and tailors a résumé, versioned with a "redo with a note" flow.
- **Change log** — every edit is attributed to You or CoWork and shown in a feed.
- **Interview prep** — DB-backed coding / system-design question tracking with
  per-company playbooks and attempt history.
- **Inbox reconciliation** — fold an inbox audit into the tracker (script).
- **Always-on + backed up** — optional launchd service keeps it running; a second
  agent snapshots the SQLite DB on a schedule.

## Getting started

Prerequisites: Node.js 20+ and npm.

```bash
git clone <your-fork-url> landed
cd landed
npm install
cp .env.example .env      # then edit as needed
npm run dev               # http://localhost:3000
```

The database is created on first use at `data/jobhunt.db` (gitignored). To populate the
interview-prep catalog:

```bash
npm run seed:prep
npm run seed:prep-companies
```

### Configuration

All configuration is via environment variables in `.env` — see
[.env.example](.env.example) for the full list. The most important one is `ASSET_ROOT`:
the folder the app and CoWork share for your base résumé, tailored-resume folders, the
tailor queue, and the instruction `.md` files that brief the agent. It defaults to
`./asset-root` inside the repo so a fresh clone works out of the box.

### Make it yours

Two things ship with generic placeholder defaults that you should personalize — both are
the biggest drivers of how the app assesses fit:

- **Your search profile** — level baseline, included/excluded disciplines, and locations.
  Edit it on the **Discovery** page (stored per install in the DB). The shipped defaults in
  [lib/db/profile.ts](lib/db/profile.ts) are illustrative only.
- **Target companies** — the list that decides whether a newly-seen company starts in the
  "target" vs "practice" tier. It's a single starter list in
  [lib/targets.mjs](lib/targets.mjs) — edit it for your own search. (You can also re-tier any
  company in the UI regardless.) The leveling anchor ladder defaults to Amazon's and is
  swappable on the Discovery page.

## How CoWork fits in

Agentic work happens through **Claude CoWork**, which connects to the app's MCP server
([mcp/jobhunt-server.mjs](mcp/jobhunt-server.mjs)) and reads/writes the same SQLite DB
over a set of tools. The brief that tells CoWork how the system works lives in
`ASSET_ROOT/instructions/README.md` — that file is the single source of truth for the
agent and is editable both on disk and from the app. (This open-source copy ships
without a populated asset root; create your own `instructions/` to drive CoWork.)

To wire the MCP server into Claude, point your MCP client at
`mcp/jobhunt-server.mjs` (it talks to the running app at `JOBHUNT_URL`, default
`http://localhost:3000`).

## Database & backups

`data/jobhunt.db` (SQLite, WAL mode) is the single source of truth and is **not**
committed. Back it up with:

```bash
npm run backup   # writes a VACUUM INTO snapshot to data/backups, integrity-checked
```

Each snapshot is consistent and self-contained (safe to sync to cloud storage). Tune
with `BACKUP_DIR` / `BACKUP_KEEP`. To restore: stop the server, swap the file in for
`data/jobhunt.db` (clearing any `-wal`/`-shm` sidecars), and restart.

## Always-on server (optional, macOS launchd)

[scripts/serve.sh](scripts/serve.sh) runs `next dev` (hot-reload preserved) and is meant
to be supervised by a launchd agent so `localhost:3000` is always up — for the browser
and for CoWork. Create a LaunchAgent plist (label e.g. `com.jobhunt`) whose
`ProgramArguments` points at this repo's `scripts/serve.sh`, then:

```bash
chmod +x scripts/serve.sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jobhunt.plist
launchctl enable  gui/$(id -u)/com.jobhunt

# maintenance
launchctl kickstart -k gui/$(id -u)/com.jobhunt   # restart after pulling code
launchctl bootout      gui/$(id -u)/com.jobhunt   # stop (e.g. to run npm run dev by hand)
```

Because launchd owns port 3000, don't also run `npm run dev` by hand while it's up.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` | ESLint |
| `npm run test` | Node test runner (`tests/*.test.ts`) |
| `npm run seed:prep` / `seed:prep-companies` | Seed the interview-prep catalog |
| `npm run import:prep` | Import coding-prep progress |
| `npm run backup` | Snapshot the SQLite DB |
| `npm run diagram:arch` / `diagram:pipeline` | Regenerate the docs diagrams |

## Project structure

```
app/         Next.js App Router — routes (UI) + /api (server routes)
components/  React components (pipeline, change feed, prep, …)
lib/         Domain logic — db (Drizzle schema + queries), jobs, agents, prep
hooks/       Client data hooks
mcp/         MCP server exposing the DB to Claude CoWork
scripts/     Seeds, imports, backups, diagram generators, the serve wrapper
docs/        Architecture & pipeline docs (some auto-generated)
tests/       Node test-runner tests
```

See [docs/architecture.md](docs/architecture.md) and [docs/pipeline.md](docs/pipeline.md)
for more.

## License

[MIT](LICENSE).
