# Leveling: fetch a company's levels.fyi ladder

This is a **lazy, on-demand** job — queued from the app's fit view (the **Lvl** column) when a
company has no stored ladder yet, or to re-check a confirmed `none`. It's split out of
`watchlist-add` on purpose: the levels.fyi geometry read is the slow, fragile part, and the ladder
isn't needed until you're actually assessing fit for that company.

**Goal:** pull the company's IC SWE ladder from levels.fyi, normalize it to the shared 1–10 scale
anchored on the reference ladder, and store it on the company record with `upsertCompanies` (the
`leveling` field). Nothing else changes — this does not touch fetch config, titles, or the
watchlist flag.

Read my **profile** + the reference ladder from `getContext` first (the anchor company + target
rung the app draws every company against). The job's `params.company` is the company to level.

## Collect from levels.fyi (headless script — no attached browser)

The levels.fyi compare view is a slow, JS-rendered SPA, so it needs a real browser. The
**CoWork/queue context has no Claude-in-Chrome connector**, so do NOT try to drive Chrome. Instead
run the headless scraper, which loads the compare view anchored on the reference company (from the
profile) in headless Chromium, reads each level bar's **DOM geometry** (exact, not pixel-guessed),
self-calibrates against the anchor ladder's own rungs, and prints the finished `leveling` object.
No paid API.

```bash
node scripts/levels-scrape.mjs "<Company>"     # brand name, WITH spaces — e.g. "Scale AI"
```
(Equivalently `npm run levels:scrape -- "<Company>"`.) It takes ~40–70s (the SPA renders slowly; the
script polls patiently and exhausts the budget before concluding — so it won't false-negative).

**Prereq (one-time):** the script needs Playwright + headless Chromium. If you get a "Cannot find
package 'playwright'" or a missing-browser error, install once: `npm i -D playwright && npx
playwright install chromium`, then re-run.

**stdout is a single JSON object — handle the three cases:**
1. **Has a ladder:** `{ "source":"levels.fyi-geometry", "ladder":{…}, "titles":{…} }` — pass it
   straight into `upsertCompanies` (below). The script already produced the normalized 1–10 ranges
   anchored on the reference ladder and the per-rung role titles. (The app computes where my baseline
   level straddles itself from the ranges — there's no overlap field to record.)
2. **Confirmed no ladder:** `{ "source":"none", "note":"…(date)" }` — the anchor company rendered but
   the target company has no column. Write `leveling:{ "source":"none" }` and put the `note` into the company's `notes`.
3. **Error:** `{ "error":"…", "retryable":true }` (exit 1) — it couldn't load (levels.fyi slow/blocked).
   **Retry once.** If it still errors, do **NOT** write `source:"none"` (that's a false negative) —
   leave the job and tell the user, or ask for the working `?compare=<anchor>,<Company>` URL.

**Brand-name / slug note:** use the **brand name with spaces** (`"Scale AI"`, not `ScaleAI` — the
no-space guess is what caused Scale AI's earlier false `none`). If a genuine `none` comes back but you
suspect the token is just wrong (an unusual legal name), ask the user for the working compare URL and
retry before trusting the `none`.

> Why a script and not the old pixel method: it reads `getBoundingClientRect` off the rendered bars
> (no viewport/zoom fragility), distinguishes the slow **loading** state from a genuine **no-column**
> by exhausting the poll budget, and runs headless — so the Leveler works from the queue with no
> Chrome attached. Labels aren't always `L#` (Anthropic uses role names, Confluent uses L5a/L5b, quant
> shops are flat) — the script keys the ladder by whatever code each bar shows, so this just works.

## Write it
Call **`upsertCompanies`** with just the `leveling` field (matched by name; only this field
changes — don't clobber fetch config or titles):
```json
{ "companies": [{
  "name": "Stripe",
  "leveling": {
    "source": "levels.fyi-geometry",
    "ladder": { "L2": [3.1, 4.8], "L3": [4.8, 6.6], "L4": [6.6, 8.2] },
    "titles": { "L2": "Software Engineer", "L3": "Senior Software Engineer", "L4": "Staff Software Engineer" }
  }
}]}
```
(or `{ "source": "none" }` when there's confirmed no ladder — with the how/date in `notes`.)
`titles` keys must match `ladder`.

This job has **no `submitJobResult` ingest** — you write directly via `upsertCompanies`, same as
`watchlist-add`. The fit view picks up the ladder on its next load (the Lvl column flips from
"not fetched" to the side-by-side chart).
