# Job: prep

Log my **coding-practice progress** from a session so the app can track it — how many
times I've done each problem, my best time, my latest result, and notes. One record per
question worked.

This is a personal scratchpad (no change-log, no human review): just report what happened.

## What to report (per question)

### Identity — how the app finds the question
Give **one** of these so the app can match the question in its catalog:
- `leetcodeNum` — the LeetCode number (preferred for LC problems; most reliable match).
- `name` — the problem name (e.g. `"Two Sum"`). Used when there's no number, and as the
  match key by normalized name.

If the question isn't in the catalog yet, the app **adds it** — so for a new problem also
include `name` plus any of `difficulty`, `url`, `tags`, `prompt` you have. A record with
neither a matching `leetcodeNum` nor a `name` is skipped.

### Attempt — what happened this session
- `status` — exactly one of `solved` · `partial` · `failed` (default `solved`).
  - `solved` = got a correct, complete solution.
  - `partial` = right idea / partial solution, needed hints or didn't finish.
  - `failed` = couldn't solve it.
- `durationSec` — how long it took, in **seconds** (optional but valuable — drives my time
  record).
- `notes` — what to remember: the key insight, where I got stuck, the pattern. (optional)
- `attemptedAt` — ISO timestamp (optional; defaults to now).

### Flags (optional)
- `noted` — `true` if a full writeup/notes were produced for this question.
- `redo` — `true` to drop it in my redo queue (worth revisiting).

## Output
Hand the result back with the **`submitJobResult` MCP tool** — `type: "prep"`, `jobId` = the
job's id (omit for a self-initiated run), and `records` = one object per question worked:

```json
[
  { "leetcodeNum": 1, "status": "solved", "durationSec": 480,
    "notes": "Hash map complement in one pass. Clean.", "noted": true },
  { "leetcodeNum": 23, "status": "partial", "durationSec": 1500,
    "notes": "Min-heap of list heads; fumbled the heap comparator. Redo.", "redo": true },
  { "name": "Design Rate Limiter", "difficulty": "Medium",
    "url": "https://...", "tags": ["Sliding Window"],
    "status": "failed", "notes": "New problem — token bucket vs sliding window log." }
]
```

The app matches each record by `leetcodeNum` then by name, appends the attempt (refreshing
times-done / best-time / last-status), inserts any new question as `track: "coding"`, and
applies the flags — then records and archives the job automatically.
