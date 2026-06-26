# Unify `candidates` + `applications` → one `postings` model

**Goal:** collapse the two data models (discovery `candidates` + tracker `applications`) into a
single **`postings`** table with one `stage` field spanning the whole lifecycle (scan → fit →
tailor → applied → interview → offer → closed). The Discovery funnel and the Pipeline board become
two views of the same table.

**Why:** today an applied job exists twice (a `candidates` tombstone *and* an `applications` row),
`fitScore`/`fitDetail`/`jd`/`resumeDir`/`url`/`location` are duplicated, and both tables carry
early-lifecycle states (`assessed`/`tailoring` in both; the board's `discovered` == the funnel's
fit-queue). One model removes the duplication and the dual render path, and unlocks the
interview/offer stages on the funnel page.

## Decisions (locked)

- Plan-first, then build staged. ✅
- Keep **all** rows in one table; add an index on `stage` (no pruning of `filtered` for now). ✅
- Rename table `candidates` → **`postings`**. Keep the external routes `/api/scanned` and
  `/api/applications` as-is (both now backed by `postings`) to limit churn. ✅
- Save this plan (this file). ✅

## 1. Target schema: `postings`

Rename `candidates` → `postings`; fold in the tracker-only columns from `applications`:
`level`, `team`, `channel`, `note`, `interviewed`, `needsReview`, `historical`, `appliedDate`.
(`postings` already has the rest: `companyId`, `atsId`, `title`/`role`, `location`, `url`,
`department`, `verdict`, `reason`, `jd`, `fitScore`, `fitDetail`, `resumeDir`, `discoveredAt`,
`scannedAt`.) Add indexes on `(stage)` and `(companyId)`.

Note: `candidates.title` vs `applications.role` — unify on one (keep `title`, map `role`→`title`).

## 2. One `stage` enum (merge the two)

```
scan:    filtered · matched
triage:  review · dismissed
fit:     fit_queue · assessed · apply_later
tailor:  tailoring · tailored
tracker: applied · interview · offer · accepted · rejected · ghost · withdrawn · company_skipped · expired
```

Status→stage mapping at migration (applications side):
- `discovered → fit_queue`
- `assessed → assessed`
- `tailoring → tailoring` (or `tailored` if `resumeDir` is set)
- `applied`/`interview`/`offer`/`accepted`/`rejected`/`ghost`/`withdrawn`/`company_skipped`/`expired` → pass through

Candidates side: `state` values carry over unchanged (already the canonical stage).

## 3. Migration (the crux — de-dup the tombstone pairs)

DB backup first (existing `npm run backup`). Idempotent, guarded.

For each `applications` row A:
1. **Find its candidate tombstone** — a `candidates` row with `state='applied'`, same `companyId`,
   matching `url` (else `atsId`, else normalized `role`/`title`).
   - **Found →** merge: copy A's tracker fields onto that posting (`stage` from A's status,
     `appliedDate`, `interviewed`, `needsReview`, `channel`, `note`, `historical`, `level`, `team`,
     `source`); delete A. The scan row becomes the single posting.
   - **Not found** (manual / `historical` / inbox-sourced) → convert A into a standalone posting
     (stage = mapped status; scan-only fields null).
2. Drop the `applications` table once all rows are migrated.

After cutover, `apply` just sets `stage='applied'` on the one posting (no insert, no tombstone).

## 4. Code cutover

| Area | Files | Change |
|---|---|---|
| Schema + migration | `lib/db/schema.ts`, `lib/db/index.ts` | unified table, indexes, merge migration |
| Queries | `lib/db/queries.ts` | one table; `listPostings`/`getPosting`/`scannedAction`/`applyGlance`/`listScannedPostings`/`scannedBucketCounts`/`updateApplication`/`deleteApplication` key off `stage`; `apply` updates stage in place |
| Funnel | `components/DiscoveryView.tsx` | drop `fromScanned`/`fromPosting` split → one normalizer; Applied = a stage filter |
| Board | `lib/pipeline.ts`, `components/board/PipelineView.tsx`, `components/Board.tsx` | columns map to stage groups |
| Tracker hook | `hooks/useApplications.ts` | fetch tracker-stage postings; mutate `stage` |
| Inbox / reconcile | `lib/agents/reconcile.ts` | match emails against tracker-stage postings only (never scan rows) |
| Jobs | `lib/jobs/store.ts`, `lib/jobs/registry.ts`, `lib/jobs/scan.ts` | write `postings` (mostly rename; fit/tailor ingest already candidate-based) |
| Edges | `mcp/jobhunt-server.mjs`, CSV export, `/api/applications` + `/api/scanned` routes | repoint to the one table; keep endpoints, swap backing |

## 5. Sequencing (each step ends green: `tsc` + 14 tests)

Two refinements made during Stage 1:
- **The merge moved to Stage 2** — it must be coupled with repointing the tracker reads, or the
  merged rows would go stale (the app would still write to `applications`). So Stage 1 is the
  additive schema foundation only.
- **The physical rename `candidates`→`postings` moved to the final stage.** Reason: `queries.ts`
  has a `candidates:` *property* (the pending-match list) that isn't the table, so a blind rename is
  unsafe mid-flight. Renaming last (once reads are unified) makes it a contained edit. Until then
  the unified table is physically `candidates` and the stage column stays `state`.

- [x] **Stage 1** — schema foundation: folded the tracker columns into `candidates`
  (`level`, `team`, `source`, `channel`, `note`, `interviewed`, `needs_review`, `historical`,
  `discovered_at`, `applied_date`, `updated_at`), extended the `state` enum to the full lifecycle,
  added indexes on `(state)` and `(company_id)`. Idempotent migration; DB backed up. No behavior
  change. ✅
- [x] **Stage 2** — merge migration + full read/write cutover. ✅
  - Merge in `db/index.ts`: each `applications` row merges into its candidate tombstone (matched by
    url/title) or becomes a standalone posting; processed rows deleted (idempotent, transactional).
    Verified on the real DB: applications 77→0, candidates 2860→2934, tracker-stage = 77 with the
    status distribution intact (applied 25 · ghost 23 · rejected 21 · interview 5 · company_skipped 3).
  - `queries.ts`: `toPosting`/`listPostings`/`getPosting`/`updateApplication`/`deleteApplication`/
    company-move/tier/needs-review/pending-match all read/write `candidates`, scoped to
    `TRACKER_STAGES`; `apply` advances stage in place (no second row). `TRACKER_STAGES` homed in
    `lib/pipeline.ts` (leaf) to avoid an import cycle.
  - `reconcile.ts`: inbox matching on `candidates`, pool scoped to tracker stages (never scan rows),
    `status`↔`state` / `role`↔`title` remapped.
  - `store.ts` (tracked count), `scan.ts` (dedup), `registry.ts` (unused import) repointed.
  - Tests + seeds updated (`seedApp` seeds a tracker-stage candidate). tsc + 14 tests green.
  - Note: `scripts/import-tracker.ts` (manual CSV importer) still targets `applications` — fold into
    Stage 4/5; it's not on the runtime path.
- [x] **Stage 3** — board/hook audit. Already satisfied by Stage 2: the board columns
  (`applied`/`interviewing`/`closed`) map from `status` (=`state`), and the hook's mutations flow
  through `updateApplication` (writes the unified table). No code change. Verified live. ✅
- [x] **Stage 4** — MCP rides the repointed routes (`/api/applications`, glance, submitJobResult) —
  no change. No CSV export writer exists. `scripts/import-tracker.ts` repointed to the unified table
  (scoped to tracker stages so a re-import never nukes scan rows). ✅
- [x] **Stage 5** — renamed `candidates` → **`postings`** (table + canonical Drizzle export);
  physical `ALTER ... RENAME` migration carries the 2,934 rows over (verified). `interviews` FK →
  `postings`. Avoided the call-site/property-collision churn via a transitional alias
  (`export const candidates = postings`) — safe because the relational `db.query` API is unused.
  Verified live: board + funnel + APIs all serve against `postings`. ✅
- [x] **Stage 5b (final sweep)** — done. ✅
  - Retired the transitional aliases: swept every call site `candidates`→`postings`,
    `CandidateRow`→`PostingRow` (careful regex preserved the `candidates:` pending-match property,
    `res.candidates`, and `candidateIds`); removed the schema aliases.
  - Dropped the dead `applications` table + `ApplicationRow` from the schema; migration drops the
    now-empty table and **rebuilds the empty `interviews` table so its FK targets `postings`**
    (a dangling FK to the dropped table would have broken `deleteApplication`). FK toggled off
    during the reshape. Verified on the real DB: `applications` gone, `postings` 2,934 intact,
    `interviews` FK → `postings`. App + tests green.
  - One cosmetic remnant: a few comments/test names still say "candidates" (the concept) — harmless.

## 6. Risks / watch-list

- **Scan noise volume** — `filtered`/`matched` dominate (~2,660 rows). Every tracker/board query
  must scope by `stage`; rely on the `stage` index.
- **Tombstone de-dup correctness** — the migration merge is the highest-risk step; snapshot first,
  assert post-migration counts (no orphaned tombstones, no dropped applications).
- **Reconcile must ignore scan rows** — inbox matching scoped to tracker stages only.
- **`role` vs `title`** — pick one column; map consistently across MCP + export.
