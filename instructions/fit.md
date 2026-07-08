# Job: fit

Assess how well I fit each posting. What I actually act on is **(1) the main gaps** and
**(2) a leveling-match call** — the score is secondary. Gaps and level drive my decision to
tailor, apply as-is, or skip.

## What to read
1. The **JD** for each posting in `params.postings` (each has an `id`, `company`, `role`, a `jd`,
   and/or a `url`). **Use `params.jd` when it's non-empty** — it's usually pre-filled from the
   scan, so don't re-fetch. Only **fetch the JD from `url`** when `jd` is empty (e.g. companies
   CoWork fetched itself). Keep each posting's `id` — you echo it back in the result.
   - **As soon as you have the JD, save it** with the **`savePostingJd(id, jd)` MCP tool** (one
     call per posting). This stores the JD on the posting so the later tailoring job reuses it
     instead of re-fetching from the link. Do this even when `params.jd` was already filled —
     it's a cheap idempotent write. It's a **separate** call from `submitJobResult`; don't try to
     pass the JD back inside the fit result.
2. My **base resume**: `resume/resume-ref.docx`.

Judge gaps and level against what you actually know about me, not just keyword overlap.

## What to assess (per posting)

### 1. Main gaps — the primary output
The few gaps that actually decide *this* screen, each tagged **hard** or **soft**:
- **hard** = a concrete requirement I don't clearly meet (specific tech/stack, domain,
  years, a credential, on-site/location, etc.).
- **soft** = scope/leadership/ambiguity/communication-type expectations I'd have to stretch
  into.

Keep it to the **2–4 that matter** — not an exhaustive checklist. If there's no real gap,
say so plainly.

### 2. Leveling match
Read my **profile** from `getContext` first — it carries my **level baseline** (my current /
most-recent level and how long I've held it), the **target-level rule**, and my disciplines /
background; my base resume (below) is the fuller record. Judge the posting against that baseline,
never a hardcoded one. The level I should target typically depends on company size:
- **Bigger / rigorous-leveling companies** (FAANG-scale, large public, strict ladders) →
  hold at the level that maps to my baseline; the rung above is a stretch, especially when I've
  only recently reached my current level.
- **Smaller companies / startups** (title inflation, broader scope per IC) → the rung above my
  baseline is a fair target.

Call the posting's advertised level exactly one of:
- **match** — lines up with where I'd land at this company size.
- **stretch** — a level above where I'd realistically land (apply, but expect a harder bar).
- **under-leveled** — below my level; likely a step back.

One line on why, grounded in company size + my level baseline from the profile.

### 3. fitScore (0–100)
A rough sortable signal, weighted: must-have **hard-gap** coverage (most), then **leveling
match**, then domain overlap. Don't over-think it.

## Output
Hand the result back with the **`submitJobResult` MCP tool** — `type: "fit"`, `jobId` = the
job's id, and `records` = one rich object per posting. **Give real detail, not one-liners.**

```json
[
    {
      "id": 1234,
      "company": "Stripe",
      "role": "Staff Software Engineer",
      "fitScore": 72,
      "levelMatch": { "call": "stretch", "why": "Staff at a big rigorous-leveling co; against my level baseline I'd more likely land one rung lower." },
      "recommendation": "tailor",
      "strengths": [
        "8 yrs backend incl. high-scale distributed services",
        "Owned a payments-adjacent ledger rewrite end to end"
      ],
      "gaps": [
        { "text": "payments/fintech domain", "severity": "hard", "detail": "JD wants 3+ yrs payments systems; my experience is adjacent (ledger) but not core payments." },
        { "text": "staff-scope cross-org influence", "severity": "soft", "detail": "JD expects driving roadmaps across teams; my scope has been single-team lead." }
      ],
      "summary": "Strong backend match; level is a reach and payments domain is the real gap."
    }
]
```

Field rules:
- `id` — **copy `params.postings[].id` back exactly, unchanged.** This is how the app matches your
  result to the right posting. Don't omit it, don't invent one — just echo the number you were given.
- `fitScore` — 0–100 (see above).
- `levelMatch.call` — exactly one of `match` · `stretch` · `under-leveled`; `levelMatch.why` — one line.
- `recommendation` — exactly one of `tailor` · `apply` · `skip`.
- `strengths` — the few that matter (array of strings); omit if none stand out.
- `gaps` — array of `{ text, severity: "hard"|"soft", detail }`; `detail` explains *why* it's a
  gap (JD ask vs. my resume). Keep to the 2–4 that decide the screen. Empty array if none.
- `summary` — one line tying it together.

(The JD is **not** a result field — save it separately with `savePostingJd(id, jd)`, see "What to
read" above.)

The app matches each record to the candidate by its `id` (falling back to company + url/role if the
id is missing), stores the assessment, and moves it `fit queue → assessed` (it stays
in discovery — the candidate, not the tracker) — then records and archives the job automatically.
Each assessment is kept as a version, so re-scoring never loses the earlier one.

## Redos (when the task carries a prior conversation)

The task may include a **"Prior fit conversation"** — your earlier assessment(s) interleaved with
my redo requests (`[redo] …`). When present, read the whole thread and **re-assess to
address the latest redo request** specifically (e.g. "weight leadership scope over IC depth"), then
submit a fresh full assessment as usual. The app stores it as the next version.
