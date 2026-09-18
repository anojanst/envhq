---
description: Recommend the next ticket to work on from the EnvHQ roadmap
argument-hint: "[optional: a workstream, e.g. payments]"
---

Optional focus: $ARGUMENTS

1. **Read the roadmap.** List tickets in the "Roadmap 2026 — SaaS" database
   (data source `collection://b54470c6-1d92-48d4-ac0c-2e8f7121884f`, at
   https://app.notion.com/p/38e30b8798c143c2a2022cea15f5ef69). If
   "$ARGUMENTS" names a workstream (cleanup, performance, pipelines, payments,
   admin), restrict the recommendation to it; otherwise consider all five.
2. **Filter to what is actually startable.** Skip anything Done or In review.
   Skip anything whose "Depends on" ticket is not finished — and say which
   blocker is in the way rather than silently dropping it.
3. **Check reality, not just the board.** Before recommending, confirm the
   work isn't already done in the repo: the board can lag behind `main`. A
   quick look at the files the ticket concerns is enough.
4. **Recommend one, with a reason.** Give a single recommendation and say why
   it comes first — unblocks other tickets, carries the most risk while
   unstarted, or is the cheapest real improvement. Name the two runners-up in
   one line each.
5. **Sanity-check the sequence.** Two rules hold across this roadmap:
   measurement comes before optimisation, and the deploy-key design decision
   comes before any pipeline code. If the board's priorities conflict with
   either, say so.
6. **Stop there.** Recommend; do not start implementing. The user runs
   `/implement <ticket>` when they've chosen.
