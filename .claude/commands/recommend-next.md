---
description: Recommend the next EnvHQ Build Backlog ticket to work on
argument-hint: (no argument needed)
---

Recommend the next ticket to pick up from the Notion Build Backlog — don't
start implementing it.

1. **Pull the backlog.** Query the Build Backlog data source
   (`collection://7386b542-2157-443f-9dfa-2e18ea74f54a`, under the hub page at
   https://app.notion.com/p/b0732d9acd9f479baf8931f999c672c2) for every
   ticket's title, Phase, and ADR relation. The hub's Ref numbers are
   creation-order, not phase-order — sort/group by Phase yourself (P0
   Prerequisites → P5 SaaS).
2. **Check what "done" actually means here.** Look at the data source's real
   properties first — don't assume a Status/Done field exists just because
   the ADR database has one. If it does, trust it. If it doesn't, infer
   completion per candidate ticket (working in phase order) from repo state:
   `git log` for commits referencing the ticket, and whether the files in its
   "Files" field exist and look implemented. This is a heuristic, not ground
   truth — say so explicitly in the recommendation.
3. **Respect phase order and dependencies.** Don't recommend a later-phase
   ticket ahead of an earlier-phase one that looks incomplete, unless the ADR
   relation shows they're actually independent.
4. **Recommend one.** Pick the earliest-phase, unblocked, not-yet-done ticket
   and fetch its full detail (Why/Scope/Acceptance Criteria/Files/Gotchas) so
   the recommendation has substance, not just a title. Name 1-2 runner-up
   alternatives with a one-line reason each (e.g. "blocked on P0-04", "same
   phase, smaller blast radius").
5. **Mark it Ready — with confirmation.** Ask the user to confirm before
   touching Notion. On a clear yes, set the recommended ticket's status
   property to Ready. Check the property's actual available options first —
   don't assume "Ready" exists as a value; if it doesn't, tell the user what
   options do exist and ask which to use instead of inventing one. Only touch
   the one recommended ticket, never the runner-ups, and only the status
   field — leave every other property untouched. If the user doesn't
   confirm, leave it as-is.
6. **Still just a recommendation.** This command doesn't implement anything.
   If the user wants to proceed, point them at `/implement <ticket name>`.
7. **Flag uncertainty.** If completion had to be guessed rather than read
   from a real property, list which tickets you're unsure about and suggest
   the user confirm/mark them in Notion — don't silently treat the guess as
   fact on the next run. Tickets this command has already marked Ready/Done
   in a prior run are real signal, not a guess — trust them.
