# Job: prep-research

Research a company's **interview process** and build its prep profile in the app — a
product/company overview, the rounds, the categories they test, and a concrete question set
(reusing my shared coding / system-design banks where they overlap). One company per job.

This powers the company's prep page at **`/prep/company/<slug>`** (also surfaced under **Prep →
Interviewing now** for companies in the interview stage). The page is built entirely from what you
submit: a concise `overview` heads it; the questions are split into three trackers — **LeetCode**,
**System Design**, and **Other** — keyed off each question's `track`. Each question carries a
clickable **confidence** tag (confirmed vs likely, with the `reason` + `source`); confirmed
questions sort first. A docked **Claude Code chat** (one session per company, seeded with this
profile) sits on the right of the page — that's where the candidate iterates and refines the prep.

This is a personal scratchpad (no change-log, no human review): just report what you found.

## How to research

The company + role are in the job's `params` (`company`, optionally `role`). Find how *this*
company runs *this kind of* interview. Good sources: the company's own engineering blog and
careers pages, Glassdoor / Blind / Reddit interview reports, levels.fyi, and recent candidate
write-ups. Prefer recent, specific, corroborated intel over generic advice. Note where each
claim came from (`sources`).

**`params.intel` is ground truth.** When the job carries `params.intel`, it holds the user's
*first-hand, recruiter-confirmed* intel from this exact loop and **overrides public sources**:
- `intel.rounds` — `[{ kind?, date?, notes? }]`, the loop the recruiter described (`notes` carries
  format/focus, e.g. "75 min live coding · DS&A"). Build the profile's `rounds` from these; only
  add a round from public research if it fills a gap the recruiter didn't mention, and don't drop
  a confirmed round.
- `intel.comp` — comp-structure notes (funding/runway, base, bonus, equity). Fold the relevant
  business/stage signal into `overview`; don't invent comp figures from public sources.
- `intel.teamNotes` — team / product / work / role-focus notes. Lead the `overview` with these.
Research only to *fill gaps* around this intel (sample questions, what each round tests, sources).

Cover the **whole loop** — not just coding: OA/screen, technical rounds (coding, system
design, any company-specific/bespoke technical), AND the behavioral / values / leadership
rounds. Companies with their own leadership principles (Amazon, etc.) test them hard.

**Prioritize PAST questions** — what candidates report was *actually asked* (Glassdoor / Blind /
LeetCode "asked at X" / write-ups). Mark those `confirmed` (cite the `source`); reserve `likely`
for your predictions. The page is built around three trackers per company, keyed off each
question's `track`:
- **LeetCode** (`track: "coding"`) and **System Design** (`track: "system_design"`) — give a
  `leetcodeNum` / exact name so the app **reuses my shared bank** (attempt history + best time carry
  over across companies — the whole point of tracking in-app vs. a one-off chat).
- **Other** (`track: "behavioral"` / `"other"`) — bespoke questions that aren't standard LC/SD
  (company-specific design, take-homes, behavioral). This tracker is mainly for the `confirmed`
  ones, so be sure to mark confidence + source.

## What to submit

A single batch with **one profile record** and **one record per question**.

> **Everything you output must be sourced.** Every question record carries a required `source`
> (where it was reported, or — for a prediction — the basis for it), and the profile's claims trace
> to its `sources` array. Don't emit anything you can't point at. The UI surfaces each question's
> source and flags any that's missing.

### Profile record — `{ "type": "profile", ... }`
- `company` — the company name (required; the app derives the slug from it).
- `overview` — a **concise, role-relevant** product/company snapshot (≈3–5 sentences / tight
  bullets, not an essay). Keep only what matters for *this* candidate's role + interviews: what they
  build, who for, scale/stage, and the engineering/domain context an interviewer expects you to
  know. Cut generic marketing and anything not useful for prep. Lead with the `intel.teamNotes` when
  present.
- `process` — a short markdown overview of the end-to-end *interview* loop (screen → … → onsite).
- `rounds` — **ordered** array of `{ key, name, format?, focus? }`. `key` is a short stable slug
  (e.g. `"screen"`, `"coding-1"`, `"sys-design"`, `"values"`) — questions reference it to land in
  that round. e.g. `{ "key": "sys-design", "name": "System Design", "format": "60 min",
  "focus": "scalability, tradeoffs" }`.
- `categories` — **optional**, ordered array of `{ key, label, description?, kind }`. The page no
  longer renders a tab per category — questions are grouped into the fixed LeetCode / System Design /
  Other trackers by their `track`. Only include categories if you want to override a question's card
  `kind` (a question's `category.kind`, when set, wins over its `track`); otherwise omit.
- `sources` — array of `{ label, url? }` you drew on.

### Question records — `{ "type": "question", ... }`
- `round` — the `key` of the round it belongs to (the primary grouping on the page). Omit only
  if you truly can't place it.
- `confidence` — `confirmed` (sourced / actually asked before) or `likely` (your prediction from the
  role + company patterns). Each question shows a clickable confidence tag; confirmed ones sort first.
- `source` — **REQUIRED on every question** (label or url — the tag links it). This is non-negotiable:
  nothing you output should be uncited, and the UI flags any question with no source as "not cited".
  - `confirmed`: where it was reported (Glassdoor/Blind/LeetCode/a write-up — prefer a url).
  - `likely`: the **basis** for the prediction — a levels.fyi ladder, the company's eng blog, the
    role's JD, or a named precedent ("standard SDE2 SD round", "their public design docs"). A
    prediction still has to point at *why you believe it*.
- `reason` — a short one-liner shown when the tag is clicked: for `confirmed`, *who reported it /
  when* ("asked in the Jun 2025 onsite, per a Blind report"); for `likely`, *why you predict it*
  ("core to the platform role; this pattern recurs in their coding rounds").
- `track` — `coding` · `system_design` · `behavioral` · `other` (**required** — it decides the
  tracker: coding → LeetCode, system_design → System Design, else → Other, and the card style).
  Omit and the app infers `coding` if a `leetcodeNum` is present, else `other`.
- `category` — **optional** `key` from `categories`; only set it to override the card `kind`.
- `name` — the question/scenario title (required).
- **Reuse my shared banks:** for a standard LeetCode problem give its `leetcodeNum` (or exact
  `name`). The app matches it to my existing catalog and just **tags it onto this company** —
  my attempt history / best time carry over, no duplicate. Same for a system-design question
  matched by name.
- For a **bespoke** question (something only this company asks), include the full content:
  `prompt`, and a `content` blob with any of `why` (why it matters), `approach[]`,
  `followUps[]`, `gotchas[]`, `keyComponents[]`. Add `difficulty`, `priority`, `tags`, `url`
  where you have them.
- `note` — optional, company-specific framing for this question ("asked in the platform round").
- `sortOrder` — optional; order within its round/category (defaults to submission order).

## Output

Hand the result back with the **`submitJobResult` MCP tool** — `type: "prep-research"`,
`jobId` = the job's id (omit for a self-initiated run), `records` = the profile + questions:

```json
[
  { "type": "profile", "company": "Acme",
    "overview": "Acme runs a real-time payments network for SMBs (~5k merchants, Series C). Core product is a ledger + payouts API; the eng bar is distributed-systems heavy. Recently shipped multi-region failover — expect scale/consistency questions grounded in that.",
    "process": "Recruiter screen → OA → 2 coding → system design → values round.",
    "rounds": [
      { "key": "oa", "name": "Online Assessment", "format": "90 min, 2 problems", "focus": "DS&A" },
      { "key": "coding", "name": "Coding (onsite)", "format": "2 × 45 min", "focus": "DS&A, clean code" },
      { "key": "sys-design", "name": "System Design", "format": "60 min", "focus": "scale, tradeoffs" },
      { "key": "values", "name": "Values", "format": "45 min", "focus": "ownership, conflict" }
    ],
    "categories": [
      { "key": "lc", "label": "LeetCode hit list", "kind": "coding",
        "description": "Most-reported problems — know cold." },
      { "key": "platform", "label": "Platform scenarios", "kind": "other",
        "description": "Bespoke problems mirroring their product." },
      { "key": "design", "label": "System Design", "kind": "system_design" },
      { "key": "values", "label": "Values round", "kind": "behavioral" }
    ],
    "sources": [ { "label": "Glassdoor — Acme SWE", "url": "https://..." } ]
  },

  { "type": "question", "round": "coding", "confidence": "confirmed", "source": "Glassdoor (Mar 2026)",
    "reason": "Reported asked in the second coding round, Mar 2026.",
    "track": "coding", "leetcodeNum": 23, "note": "Reported in the second coding round." },
  { "type": "question", "round": "sys-design", "confidence": "likely",
    "source": "Acme eng blog — ingestion pipeline post", "reason": "Mirrors the pipeline they describe publicly.",
    "track": "other", "name": "Streaming dedup", "difficulty": "Hard",
    "prompt": "Dedup a high-throughput event stream with bounded memory.",
    "content": { "why": "Mirrors their ingestion pipeline.",
      "approach": ["Bloom filter + rolling window"],
      "followUps": ["What if exactly-once is required?"],
      "gotchas": ["Clock skew across producers."] } },
  { "type": "question", "round": "sys-design", "confidence": "confirmed", "source": "Blind thread",
    "reason": "Multiple Blind reports cite this exact prompt.",
    "track": "system_design", "name": "Design a metrics pipeline" },
  { "type": "question", "round": "values", "confidence": "likely",
    "source": "Acme careers — leadership values page", "reason": "Directly probes their published 'disagree & commit' value.",
    "track": "behavioral",
    "name": "Tell me about a time you disagreed with your manager.",
    "content": { "why": "Probes the 'disagree & commit' value." } }
]
```

The app upserts the profile, then for each question reuses a shared bank entry (by
`leetcodeNum` / name) or inserts a bespoke one — tagging each onto this company in its round +
category — then records and archives the job automatically.

## Refinement (live chat)

The prep page has a **docked Claude Code chat** (one session per company, seeded with the whole
profile — overview, loop, and all tracked questions — plus the jobhunt MCP tools). That's where I
iterate — ask for variations, dig into a round, or request fixes. When I ask the chat to change the
prep,
treat it as a **revision** of this profile: keep what still holds, fix what I flagged, fill gaps,
and **re-submit the FULL profile + question set** via `submitJobResult` (the app upserts — a partial
submit drops what you omit). A job may still arrive with `params.refine = true` + a `task` listing
asks; handle it the same way.
