# peer-comp

Research + synthesize ONE **compensation comparison** across every role I'm **actively interviewing
for** (every posting in the interview/offer stage). Global — not tied to any one posting. Queued by
the **Generate / Regenerate** button in the **Peer comp comparison** popup (opened from **Compare
comp** on the pipeline's Interviewing view). One markdown document in, stored latest-only.

## Input (job task)
The task embeds a **roster** — one block per interviewing role — with whatever comp signal the app
already holds: my free-text `comp` notes, my general notes (comp from a recruiter call often lands
here), team/stage notes, captured recruiter `emails.md`, and the JD (each clipped). Roles with no
stored signal are still listed so you know the full set. That roster is your ground truth; start from
it, don't second-guess figures I've recorded.

## Steps
1. For each role in the roster, also read `interview-prep/<slug>/` if present (context.md,
   transcripts, emails.md) for any comp/level detail not already inlined.
2. **Fill every field you can from the provided data** (my notes, JD, recruiter emails). For
   Base/Bonus/Equity give the figure or range; if recruiter and JD disagree, show both and label
   which is which.
3. **Research external comp/valuation to fill gaps** — levels.fyi for the ladder/band, funding news
   for stage + latest valuation. Use your own knowledge of the company when the data is silent.
4. **Never invent numbers.** Mark genuinely-unknown fields `Not disclosed` or `Unquantified`. Round
   figures; label anything estimated.
5. Merge duplicate requisitions for the same firm/process into one row.

## Output — submit ONE record
`submitJobResult(type:"peer-comp", jobId:<this job>, records:[{ "markdown": "…" }])` — a single record
carrying the whole document as GitHub-flavored markdown (no code fences, no preamble).

The markdown is: FIRST a table with EXACTLY these columns in this order —

```
| Role | Base | Bonus | Equity | Company stage | Upside character |
```

one row per role, ordered by realistic total comp (highest first; unknown-comp roles last) — THEN a
3–5 sentence prose synthesis (no bullets). Column guidance:
- **Role** — `Company — Role`.
- **Company stage** — funding stage + latest valuation + trajectory.
- **Upside character** — ONE phrase on the *character* of the upside (e.g. pre-IPO RSU multiple,
  cash-not-equity, compressed late-stage, liquid/capped, unproven early-stage) with a quantified move
  where you can. Judge risk-adjusted potential, not just the headline number.

The app stores this as the latest comparison in app_config (overwriting the prior run) and the popup
renders it. You must hold a live claim on the job (`claimNext`/`claimJob`) to submit.
