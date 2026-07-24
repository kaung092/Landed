<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Keep the CoWork brief in sync

[`instructions/README.md`](instructions/README.md) — the tracked repo folder that `INSTRUCTIONS_ROOT`
resolves to ([lib/config.ts](lib/config.ts)) — is the **single source of truth** that briefs the
CoWork agent on how this system works. It is consumed by a live agent, not just humans — a stale
brief makes CoWork act on the wrong model. The playbooks are generic repo source (candidate-specific
detail lives in the profile config, not the prose). Edit them **in the repo** — the in-app Guides /
Instructions views are read-only (playbooks carry the agents' MCP wiring, so the UI never writes them).

When you change code that the brief describes, update `instructions/README.md` in the same change:
- **MCP tools** added/removed/renamed in [mcp/jobhunt-server.mjs](mcp/jobhunt-server.mjs) → update the tool lists.
- **Job types / playbooks** added/removed → update the "Job types" index and add/remove the `<type>.md` playbook.
- **Asset layout** changes (what lives on disk vs. in the DB, folder names, the slug convention) → update the layout section.
- **The run flow** (how the queue is processed, the discovery funnel, the Apply boundary) changes → update the matching section.

Do not create a second doc that re-describes the system — fold it into `instructions/README.md` instead.

# Architecture at a glance

Local-first job-search command center. **One SQLite DB is the source of truth**
(`data/jobhunt.db`), edited by two actors — **You** (human, via the UI) and **CoWork** (the
agent, via MCP) — and every change is attributed to one of them.

- **UI** — Next.js 16 (App Router), React 19, Tailwind 4. Routes in [app/](app/), components in [components/](components/).
- **Data** — Drizzle ORM over `better-sqlite3`. Schema + queries in [lib/db/](lib/db/).
- **Job queue** — [lib/jobs/](lib/jobs/) is the work spine: jobs are created, atomically
  *claimed* (lease-based), and their results *ingested* back into the DB. `store.ts` is the core;
  `registry.ts` maps agent result records onto postings/companies.
- **Agent surface** — [mcp/jobhunt-server.mjs](mcp/jobhunt-server.mjs) exposes MCP tools; CoWork is
  briefed by `INSTRUCTIONS_ROOT/README.md` (defaults to `./instructions`; see the sync rule above).
- **Untyped boundaries** — agent/JSON results arrive as `unknown`. Coerce them through
  [lib/coerce.ts](lib/coerce.ts) (`num` never returns NaN; `str` maps empty→undefined). Don't
  hand-roll `Number(x)` on agent input — it re-introduces the NaN-defeats-`?? fallback` bug.

# The verification loop (how we build — "loop engineering")

Features are built against an **automated feedback signal**, not by eyeballing. The signal is:

```
npm run check      # typecheck (tsc --noEmit) + full test suite — must be green
```

The loop for any behavior change:

1. **Target → test first.** Encode the goal as a test in `tests/*.test.ts` (`node:test` +
   `node:assert/strict`). Run it and confirm it fails for the right reason before writing the fix.
2. **Build the minimum** to make it pass — no opportunistic refactors (that's scope creep).
3. **Run `npm run check`** — the whole suite, to catch regressions elsewhere.
4. **Self-correct until green.** Never declare done on a red or unrun signal.

`/loop-engineer <target>` drives this loop end-to-end. Tests are pure and fast — pure logic
(`lib/coerce.ts`, `lib/leveling.ts`, `lib/linediff.ts`) and the queue (`lib/jobs/`) are all
directly testable without a live agent.

**Lint** (`npm run lint`) runs as an advisory signal — there is a pre-existing `react-hooks`
backlog it flags; burn it down, don't add to it. Once clear, make it a hard gate (see
[.github/workflows/ci.yml](.github/workflows/ci.yml)).

# Reviewing changes

Before opening a PR, review the diff with the **`code-reviewer`** subagent
([.claude/agents/code-reviewer.md](.claude/agents/code-reviewer.md)) — it checks the diff against
its stated **intent** and flags **scope creep** and missing test coverage, not general bugs. For a
deep correctness/security pass use `/code-review`. The [PR template](.github/pull_request_template.md)
requires stating intent, scope, and the green-`check` evidence for the same reason.
