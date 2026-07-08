# fitlab-assess — Fit Lab assessment

Score **one** posting against the **Fit Lab rubric** as per-criterion verdicts. This powers the Fit
Lab page (`/fit-lab`), a learning/eval surface that models fit assessment as a production
classification pipeline (Extract → Detect → Decide → Review). It's queued from that page; you
process it from the queue like any other job. It is **distinct from `fit.md`** — that writes a rich
`FitAssessment` onto a posting; this writes structured criterion verdicts into the Fit Lab's own
tables for review + labeling.

## The job is self-contained

The job's `task` already embeds everything you need — the **rubric** (each criterion's key, label,
type, and judging rule), the **candidate profile** (résumé text), and the **job description**, plus
the `runId` to echo back. You do **not** need to fetch anything else. Just read the task and follow it.

## What to do

You are the **Extract + Detect** stages. For **each** criterion in the task:

1. **Extract** — from the JD, the one short requirement phrase for that criterion's dimension (or
   `"none stated"` if the JD says nothing about it).
2. **Detect** — judge that requirement against the **candidate profile**:
   - `verdict` ∈ `met` | `partial` | `unmet` | `unclear` | `na` (`na` = the dimension doesn't apply).
   - Ground it in **specific profile evidence** (a short quote). If the profile is silent, use
     `unclear` — **not** `unmet`.
   - `confidence` 0–100, **calibrated** — do not inflate it on thin evidence.

Do **not** output an overall score or decision — the app computes that deterministically from your
verdicts (gates veto; the rest are weighted).

## Output

Close the job with `submitJobResult(type:"fitlab-assess", jobId, results)` — **one record per
criterion**, echoing the `runId` from the task:

```json
{
  "runId": 12,
  "criterionKey": "level-match",
  "requirement": "Senior+ (target level or above)",
  "verdict": "met",
  "confidence": 90,
  "evidence": "Senior Software Engineer at <Company>, 2022–2024",
  "reasoning": "most recent role matches the target level"
}
```

Submit a record for **every** criterion in the task (don't drop any). The app replaces the run's
prior verdicts with this set (so a re-run is clean) and derives the score + decision.
