# interview-emails

Capture a company's **interviewing emails** — everything recruiters and interviewers send *after* the
recruiter call — into that company's `interview-prep/<slug>/` folder. Queued by the **Pull interview
emails** button in the drawer's Interview stage. This is **asset capture only**: it writes files, it
does **not** touch tracker status or interview rounds (global inbox-sync owns those).

## Input (job params)
- `company` — the company name (for the Gmail search).
- `slug` — the folder key: everything lands under `interview-prep/<slug>/`.
- `since` — a Gmail-style `YYYY/MM/DD` date ~3 months back (the search window).

## Steps
1. **Find the threads.** `searchGmail` for the company's interviewing mail, e.g.
   `"<company>" after:<since>` — also try the recruiter's / company's domain (`from:acme.com OR
   from:greenhouse.io`). You want recruiter outreach, scheduling, "what to expect" notes, take-home
   prompts, team one-pagers, and comp mentions. Ignore unrelated mail.
2. **Read + write `emails.md`.** `getGmailThread` each relevant thread and write
   `interview-prep/<slug>/emails.md` structured **for prep**, not as a raw dump — group by round /
   interviewer:
   - **Who** you're meeting: name · title · LinkedIn (from the signature) — so the brief can prep you
     per interviewer.
   - **Format / what to expect** the recruiter or interviewer described for each round.
   - **Prep material / take-home**: links + instructions.
   - **Logistics**: dates, durations, panel.
   - **Comp** figures if mentioned.
3. **Download attachments.** For every thread that carries a file (role PDF, prep guide, take-home
   spec), call **`downloadGmailAttachments(id: <threadId>, slug: "<slug>")`** — the app saves the
   files into `interview-prep/<slug>/attachments/` and returns their names. Reference them in
   `emails.md`.
4. **Close the job.** `submitJobResult(type:"interview-emails", jobId:<this job>, records:[])` with a
   one-line `summary` (e.g. "wrote emails.md from 5 threads · 2 attachments"). There are no DB records
   to reconcile — the value is the files on disk.

## Boundaries
- **Do not** change application status, add/rename interview rounds, or set comp/JD in the DB — global
  inbox-sync is the single owner of tracker state. This job only writes into `interview-prep/<slug>/`.
- Re-running overwrites `emails.md` (fine) and adds any new attachments (de-duped by name).
- The `interview-brief` job reads what you write here, so favor clarity and interviewer names.
