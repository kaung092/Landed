# Job: linkedin-import

Fetch full, verbatim job descriptions from a LinkedIn **recommended / collection feed** (or a single
job page) and land them in my **fit queue** as postings — so they flow through the normal
fit → tailor → apply pipeline.

> **Requires the Playwright browser tools + a logged-in LinkedIn profile.** LinkedIn job pages are
> login-gated and client-rendered, so a plain web-fetch returns an empty shell. This runs via the
> **`playwright` MCP** (`browser_navigate` / `browser_snapshot` / `browser_click` / `browser_evaluate`),
> which the app wires into the Claude Code runner when `LINKEDIN_PROFILE_DIR` is set (a persistent
> Chrome profile seeded with `npm run linkedin:login`). If you DON'T have the `browser_*` tools, this
> runner has no browser — say so and stop (don't fabricate). If the feed shows a login/auth wall, the
> profile isn't logged in — tell the user to run `npm run linkedin:login`, then stop.

`params.url` is the LinkedIn URL to open; `params.count` is how many recommended jobs to grab
(default 5). URLs look like:
- Collection feed: `https://www.linkedin.com/jobs/collections/recommended/?currentJobId=<id>&…`
- Search feed: `https://www.linkedin.com/jobs/search/?currentJobId=<id>&…`
- Single posting: `https://www.linkedin.com/jobs/view/<id>/`

## How to fetch (Playwright MCP)
1. **`browser_navigate`** to `params.url`. A feed loads the left results list + a right detail pane.
2. **`browser_snapshot`** to confirm it loaded (job cards on the left, a detail pane on the right — NOT
   a login wall) and to get the element **refs** you'll click. If it's a login wall, stop (see above).
3. **For each of the first `count` jobs:**
   a. **`browser_click`** the job card's title in the left list (use its ref from the snapshot) — this
      swaps the right pane to that job and updates `currentJobId` in the URL. Give it a moment
      (`browser_wait_for` briefly, or re-snapshot) so the description renders.
   b. **`browser_evaluate`** to read the COMPLETE description straight from the DOM (the "See more" cutoff
      is only visual — `innerText` returns the whole thing). Use a resilient selector:
      ```js
      () => {
        const el = document.querySelector('.jobs-description__content, .jobs-box__html-content, article, [class*="jobs-description"]');
        return el ? el.innerText.trim() : '';
      }
      ```
   For a single `/jobs/view/` posting the description is already loaded — skip the click, just evaluate.
4. **Verify completeness** — a full JD ends on its final section (Compensation & Benefits, an EEO
   statement, Job Benefits…). If the text is empty or ends mid-sentence, re-snapshot / click "See more"
   and re-evaluate.
5. **Capture header metadata** the body may omit — company, title, location + work-type, salary — via a
   second `browser_evaluate` on the header, or from the snapshot.

Only act on the URL you were given; don't follow outbound links inside a posting without asking.

## Output
Hand the result back with **`submitJobResult`** — `type: "linkedin-import"`, `jobId` = the job's id
(omit for a self-initiated run), and `records` = **one object per job**:

```json
[
  { "company": "Ramp", "title": "Senior Software Engineer, Platform",
    "location": "New York, NY (Hybrid)", "salary": "$180K–$240K",
    "url": "https://www.linkedin.com/jobs/view/3891234567/",
    "jd": "About the job\n\n<full verbatim description, all sections preserved>" }
]
```

- **`company`** (required) — the canonical brand name (not the LinkedIn slug). No `Inc.`/`LLC`.
- **`title`** (required) — the role title.
- **`jd`** (required) — the COMPLETE, verbatim "About the job" body, section structure preserved
  (Responsibilities, Qualifications, Benefits, …). This is the whole point — don't summarize or truncate.
- **`location`**, **`salary`**, **`url`** — optional but include when visible.

The app ingests each record as a `fit_queue` posting (new company created on the fly), storing the JD +
comp so the fit and tailoring steps reuse it without re-fetching. Deduped by `url`, else company+title —
re-importing the same job just refreshes it.
