# Job: leetcode-add (resolve a manually-added LeetCode question)

You (the human) pasted a LeetCode problem URL into the **Leetcode tracker** (General Prep →
Leetcode). The app already inserted a **stub** question — its name is a rough guess from the URL
slug, and its difficulty/topic are blank (marked pending). Your job: fill in the real details so the
stub becomes a proper tracker entry. This is a small, self-contained job — no company, no attempts.

## Params
- `id` — the stub question's id in the prep bank. **Echo it back unchanged** — it's how the result
  matches the row to fill.
- `url` — the LeetCode problem URL that was added.
- `topic` — OPTIONAL. If present, the user already chose the topic (e.g. "Heap") — **keep it, don't
  override**. If absent, you infer the topic below.

## What to determine
1. **name** — the exact problem title (e.g. `two-sum` → "Two Sum", `3sum` → "3Sum", `lru-cache` →
   "LRU Cache"). Prefer what you already know; only `web_fetch` the URL if unsure.
2. **difficulty** — one of `Easy` | `Medium` | `Hard`.
3. **topic** — the primary pattern/topic the problem belongs to (e.g. Heap, Graphs, DP, Sliding
   Window, Two Pointers, Binary Search). Skip this if `params.topic` was provided.
4. **leetcodeNum** — the problem number if you know it (optional; helps dedupe against the bank).

Do NOT invent problems or guess wildly — if a slug is unfamiliar and you can't fetch it, submit the
name from the slug and your best-effort difficulty, and leave `topic` out rather than fabricating.

## Submit
Hand the result back with **`submitJobResult`** — `type: "leetcode-add"`, `jobId` = the job's id,
and one record:

```json
{ "id": "<params.id>", "name": "Two Sum", "difficulty": "Easy", "topic": "Hash Table", "leetcodeNum": 1 }
```

The app fills the row (name, difficulty, topic tag, leetcodeNum) and clears the pending flag. It only
**fills** the existing stub — it never creates or duplicates a question here. An unknown `id` is
skipped.
