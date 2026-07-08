# Job: tailoring

Tailor my base resume to each queued posting so it's ready to submit. Reframe my real
experience to mirror the JD and clear ATS — **never invent** experience.

## What to read
1. The **JD** for each posting in `params.postings` (each has an `id`, `company`, `role`, `jd`, and
   sometimes a `url`). **`jd` is normally already filled** — carried over from the scan / fit step,
   so you shouldn't need to fetch. Only fetch it from the `url` if `jd` is empty. Keep each
   posting's `id` — you echo it back in the result.
2. My **base resume**: `resume/resume-ref.docx` — the ONLY source. Never edit it; copy from it.
3. The posting's prior **fit** record if present (gaps + leveling call) — use it to steer the edits.

## Steps (per posting) — do ALL of these. None are optional.

A tailor that only edits the summary and skills lines is **incomplete** — the experience
bullets must be **actively reworded to mirror the JD's exact terms** (truthfully), not merely
considered. Reframing bullets into the JD's vocabulary is the default; leaving a bullet untouched
is the rare exception (see 2c). Work every zone below for every posting.

1. **Write the tailoring plan first** (produce this before editing — it's the audit trail):
   - **Keywords to mirror** — the exact languages, frameworks, systems, and domain terms the JD
     names that I can *truthfully* claim.
   - **Lead bullets** — which existing bullets are most relevant to THIS JD (they move to the
     top of their role/section).
   - **Downplay** — which bullets are least relevant (they move down — never delete real
     experience, only reorder).
   - **Hard gaps** — each hard gap from the fit record + how you'll address it honestly (reframe
     an adjacent real bullet, or leave it; never fake it).

2. **Work through all four zones for every posting** (summary, skills, gaps, and bullets all
   normally change — bullets are reworded into the JD's terms by default; all four must be
   actively worked, not just considered):
   - **a. Summary / headline** — retitle to the posting's level and reframe the 2–3 sentences
     around the JD's focus.
   - **b. Skills lines** — reorder Languages and Backend to lead with the JD's named stack;
     surface truthfully-held tools the JD calls out.
   - **c. Experience bullets — reword to mirror the JD by default** — for each role, rewrite the
     bullets so they carry the JD's exact languages, frameworks, systems, and domain terms that I
     can *truthfully* claim (same facts, JD vocabulary), and reorder so the JD-relevant ones lead.
     If the JD names a term my real work covers, the bullet should say it in the JD's words.
     **Keeping a bullet as-is is the exception** — allowed only when there is genuinely no truthful
     JD keyword to surface in it. When you do keep one, the diff must say why (an `eq` line with a
     one-clause comment). Never invent: reword and reorder real work only — same facts, no new claims.
   - **d. Gaps** — apply the honest gap treatment from your plan.

3. Stay truthful — reprioritize and reword what I've actually done; never invent. Same facts,
   reframed; no new claims.

4. **Self-check before saving** — confirm: (i) every JD must-have keyword I can truthfully claim
   appears, **including inside the experience bullets** — not just the summary/skills lines;
   (ii) each role's bullets were reworded into the JD's vocabulary (or, for any bullet kept as-is,
   the diff comment says why no truthful keyword applied); (iii) nothing fabricated.

5. Save to the **exact folder the app gives you** — `resume/<params.postings[].slug>/` — with
   **generic filenames** (`resume.docx` and `resume.pdf`). The app dictates the slug
   (a versioned path like `databricks-senior-123/v2`); **don't invent your own** — write to the
   one in `params` and echo it back unchanged. Each redo is a new `v<N>` folder, so a prior
   version's files are never overwritten.

### Redos (when the task carries a prior conversation)

The task may include a **"Prior tailor conversation"** — your earlier version notes interleaved
with my redo requests (`[redo] …`). When present, this is version **v2+**: read the whole
thread, then **act on the latest redo request** specifically (e.g. "lead with the ledger rewrite").
Start fresh from the **base resume** (never from a prior version's file); produce a complete
tailored resume in the new `v<N>` folder, and in your `note` say what you changed **in response to
the redo**.

## Output
Save the tailored resume to `resume/<slug>/` as before (the resume files stay on disk), then
hand the metadata back with the **`submitJobResult` MCP tool** — `type: "tailoring"`, `jobId` =
the job's id, and `records` = one object per tailored posting:

```json
[
  { "id": 1234, "company": "Stripe", "role": "Staff Software Engineer",
    "slug": "stripe-staff-123/v1",
    "diff": [
      { "type": "eq",  "text": "EXPERIENCE" },
      { "type": "del", "text": "Built internal tooling for the data team" },
      { "type": "add", "text": "Built distributed payment-ledger services handling 10k tps",
        "comment": "mirrors the JD's 'distributed systems at scale' must-have" },
      { "type": "add", "text": "Skills: Go, Kafka, Postgres, gRPC",
        "comment": "surfaces the exact stack the JD names (was buried lower)" }
    ] }
]
```

Field rules:
- `id` — **copy `params.postings[].id` back exactly, unchanged.** This is how the app matches your
  result to the right posting. Don't omit or invent it — echo the number you were given.
- `slug` — **echo `params.postings[].slug` back exactly** (the versioned `…/v<N>` folder the app
  told you to write to). Required. This becomes this version's entry in the résumé history.
- `company`, `role` — for readability / fallback matching if `id` is missing.
- `note` — **omit it.** Don't send a prose "what changed" summary — the app no longer shows it and
  you don't read it. The per-line `diff` `comment`s below ARE the rationale now; put your
  reasoning there, not in a note.
- `diff` — **required** (it's the only place your reasoning lives now, and the app renders it as the
  version's diff view; when omitted it falls back to a plain text diff it computes itself, with no
  rationale). An **annotated, line-level diff of your tailored résumé against the base résumé** — you
  produced the edits, so you know exactly what changed and why. An array of ops, **in document
  order**, each:
  - `type` — `"eq"` (unchanged line, for context), `"del"` (a base line you removed/replaced),
    or `"add"` (a line you wrote).
  - `text` — the line's text (résumé content only; no markup).
  - `comment` — **on changed lines (`add`/`del`), the *why*** — the JD-driven reason for the edit
    (e.g. "mirrors the JD's 'event-driven architecture' requirement", "drops the mobile bullet the
    JD never asks for"). Keep it to one short clause. Omit `comment` on `eq` context lines and on
    trivial reorders where the reason adds nothing. Since there's no longer a `note`, the `comment`s
    must collectively account for the **bullet decisions** (why a bullet was reworded/reordered — or,
    on a key bullet you deliberately kept, an `eq` line WITH a one-clause comment saying why) and how
    each **hard gap** was handled. A diff whose changed lines are silent on the bullets signals they
    were never considered.

  Rules: diff against the **base** résumé (always — even on a redo, you re-tailor from base, so the
  diff is tailored-vs-base, not vs the prior version). Include a little `eq` context around changes
  so the diff reads in order, like `git diff`. Don't include blank lines.

The app records the `slug` on the matching candidate (matched by `id`, falling back to company +
url/role) and moves it **Tailoring → Tailored** (still in discovery — applying is what graduates it
to the tracker) — then records and archives the job automatically.
