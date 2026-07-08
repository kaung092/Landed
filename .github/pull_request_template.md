<!--
Landed PRs are reviewed for intent-match and scope creep (see .claude/agents/code-reviewer.md).
Fill these in so the diff can be judged against a stated intent, not guessed at.
-->

## Intent
<!-- One or two sentences: what should this change accomplish, and why? -->

## Scope
<!-- What this PR deliberately does NOT touch. Anything outside the intent above that got
     changed anyway (a drive-by refactor, a rename) belongs here with a reason — or in its own PR. -->

## Test evidence (the loop)
<!-- This repo works tests-first. Show the feedback signal: the test that captures the target,
     and that `check` is green. Paste output or link the CI run. -->
- [ ] A test was written for the target behavior (and failed before the fix)
- [ ] `npm run check` is green locally
- [ ] Docs kept in sync (`instructions/README.md` if MCP tools / job types / layout / run flow changed)

```
$ npm run check
# paste result
```
