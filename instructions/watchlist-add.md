# Watchlist: add a company (research + configure)

> **STOP — do NOT call `addToWatchlist` first.** It is the *last* step, not the first.
> Calling it on its own just flips the watchlist flag on an unconfigured record: the scan then
> returns `unsupported` (no fetch method). `addToWatchlist` never researches anything on its own —
> **you** must do the research below and write it with `upsertCompanies` *before* flipping the flag.
> If you catch yourself about to add a company you haven't researched, stop and start at §1.

Adding a company to the watchlist isn't just flipping a flag — discovery can only scan it if
it's configured. So **research two things first**, write the company record, then add it to the
watchlist and verify.

The two research tasks, both REQUIRED before adding: **(1) fetch method** (how the board is
read), **(2) target titles**. Plus location + tier.

> **Leveling is no longer part of this job.** It's the slow, fragile levels.fyi step, so it's been
> split into its own lazy **`leveling`** job (see `leveling.md`) — queued on demand from the fit
> view's **Lvl** column when a company's ladder is actually needed. Don't collect leveling here.

Read my **profile** from `getContext` first (level baseline, include/exclude disciplines,
locations) — it calibrates titles and location. Call **`listCompanies`** to see if the company is
already tracked (patch it; don't clobber existing config).

---

## 1. Fetch method (so discovery can read the board)
Figure out the ATS and how to fetch it. Sets `ats`, `slug`, `fetchMethod`, and `careersUrl`.

- **Greenhouse** — board `boards.greenhouse.io/<slug>`, API `boards-api.greenhouse.io/v1/boards/<slug>/jobs`.
  → `ats:"greenhouse"`, `slug`, `fetchMethod:"api"`.
- **Ashby** — board `jobs.ashbyhq.com/<slug>`, API `api.ashbyhq.com/posting-api/job-board/<slug>`.
  → `ats:"ashby"`, `slug`, `fetchMethod:"api"`.
- **Verify the slug/endpoint actually resolves** (fetch the API once and confirm it returns jobs
  JSON). Don't guess slugs — a wrong slug makes the scan silently empty. Careers sites migrate:
  a seeded `careersUrl`/`endpoint` may be **dead** (returns empty / redirects), so always fetch
  it live and find the current URL before trusting it. (e.g. Google moved off
  `careers.google.com/api/v3` to `www.google.com/about/careers/applications/jobs/results`.)
- **Custom site (not GH/Ashby):**
  - Plain GET of `careersUrl` returns the jobs in the HTML/JSON → `fetchMethod:"careers-get"`.
  - JS SPA / bot-protected (403, empty HTML) → `fetchMethod:"browser"`.
  - For both, write a **`fetchRecipe`**: declarative steps (which filter params/dropdowns to set,
    what to exclude, whether level comes from the title or the JD). No click coordinates.

`fetchMethod` decides who fetches during a scan: **api** = the app downloads + coarse-filters
server-side (you just read the shortlist); **careers-get/browser** = you fetch it yourself per
the recipe. (See `watchlist-scan.md`.)

## 2. Target titles
Look at the company's actual board + my profile, and pick the IC SWE titles worth surfacing at
my level (e.g. `["Senior","Staff","Member of Technical Staff"]`). Sets `titles` — the app's
coarse title filter for **api** scans, and the basis of your recipe for manual ones. Exclude the
usual non-SWE/GTM noise (EM/TPM/Solutions/Field/Forward-Deployed) — the app enforces that too,
but a tight title list keeps the shortlist clean.

## 3. Location + tier
- `location` (target_location) — the company-appropriate filter, default to my profile locations
  (e.g. `"NYC|remote"`). The scan is US-only by default; only name a non-US place if intended.
- `tier` — `tier1 | tier2 | tier3` (tier1 = top target, tier3 = broadest/practice; ask me if unsure).

---

## Write it
1. **`upsertCompanies`** with everything you found:
   ```json
   { "companies": [{
     "name": "Stripe", "tier": "tier1",
     "ats": "greenhouse", "slug": "stripe", "fetchMethod": "api",
     "careersUrl": "https://stripe.com/jobs/search",
     "titles": ["Senior","Staff"], "location": "NYC|remote",
     "notes": "..."
   }]}
   ```
2. **`addToWatchlist`** `{ company: "Stripe" }`.

## Verify
Run **`scanCompany`** for the company and confirm the config resolves. The healthy status depends
on `fetchMethod`:
- **api** boards → `status:"ok"` with a non-empty `matched` (right titles + locations).
- **careers-get / browser** boards → `status:"manual"`, echoing back `careersUrl` + `fetchRecipe`
  (the app hands the fetch to you — that's success, not an error). Confirm the `careersUrl` it
  returns is the live one you verified in §1.

If `status` is `unsupported`/`error` — or an api shortlist looks wrong — fix
`ats`/`slug`/`fetchMethod`/`endpoint` and re-run before moving on. `unsupported` specifically
means no `fetchMethod` and no greenhouse/ashby slug: you skipped §1.

## Notes
- Research one company at a time for quality; you can batch the `upsertCompanies` write if you
  did several.
- This curates fetch config + titles only; it does **not** scan and does **not** collect leveling.
  The posting scan is the separate `watchlist-scan` job; the ladder is the separate `leveling` job
  (`leveling.md`), queued lazily from the fit view.
