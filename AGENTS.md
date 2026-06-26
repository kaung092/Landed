<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Keep the CoWork brief in sync

`instructions/README.md` in the asset root (`ASSET_ROOT` in [lib/config.ts](lib/config.ts)) is the
**single source of truth** that briefs the CoWork agent on how this system works. It is consumed by
a live agent, not just humans — a stale brief makes CoWork act on the wrong model.

When you change code that the brief describes, update `instructions/README.md` in the same change:
- **MCP tools** added/removed/renamed in [mcp/jobhunt-server.mjs](mcp/jobhunt-server.mjs) → update the tool lists.
- **Job types / playbooks** added/removed → update the "Job types" index and add/remove the `<type>.md` playbook.
- **Asset layout** changes (what lives on disk vs. in the DB, folder names, the slug convention) → update the layout section.
- **The run flow** (how the queue is processed, the discovery funnel, the Apply boundary) changes → update the matching section.

Do not create a second doc that re-describes the system — fold it into `instructions/README.md` instead.
