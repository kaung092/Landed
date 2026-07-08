---
description: Loop-engineer a feature — define the target as a failing test, then build → run `check` → self-correct until green.
argument-hint: <feature or behavior to build, e.g. "num() must never leak NaN">
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---

Loop-engineer this target: **$ARGUMENTS**

Work the loop. Do NOT write implementation code until a test encodes the target.

1. **Define the target as an automated signal.** Restate the goal as concrete expected
   input→output behavior. Write the test(s) that assert it in `tests/<name>.test.ts`, following
   the existing `node:test` + `node:assert/strict` style. Cover the happy path AND the edge cases
   the target implies.
2. **Prove the test bites.** Run just the new test: `node --import tsx --test tests/<name>.test.ts`.
   It MUST fail (or fail to compile) for the right reason. If it passes already, the behavior
   exists — say so and stop; there's nothing to build. Paste the red output.
3. **Build the minimum to go green.** Implement the smallest change that satisfies the test.
   No opportunistic refactors, no unrelated files — scope discipline is part of the loop.
4. **Run the full feedback signal:** `npm run check` (typecheck + all tests). Not just your test —
   the whole suite, so you catch regressions the change caused elsewhere.
5. **Self-correct until green.** On any failure, read the actual error, fix, re-run `check`.
   Repeat. Don't declare done on a red or unrun signal.
6. **Report the loop.** Show: the target, the red output from step 2, the green `check` output,
   and the files changed. State plainly if anything is still failing — never round up.

If the target is too vague to write a test for, ask one clarifying question first, then start.
