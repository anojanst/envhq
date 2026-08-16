---
description: Fetch an implementation ticket from the EnvHQ Notion Build Backlog and implement it
argument-hint: <ticket name>
---

Ticket to implement: $ARGUMENTS

1. **Find the ticket.** Search the EnvHQ Build Backlog database in Notion (data
   source `collection://7386b542-2157-443f-9dfa-2e18ea74f54a`, under the hub
   page at https://app.notion.com/p/b0732d9acd9f479baf8931f999c672c2) for a
   ticket whose title matches "$ARGUMENTS". Match loosely (substring/fuzzy) —
   the user may not type the exact title. If more than one ticket plausibly
   matches, list the candidates and ask which one via AskUserQuestion before
   continuing. If none match, say so and stop rather than guessing.
2. **Fetch full detail.** Open the matched ticket page and read its Why /
   Scope / Acceptance Criteria / Files / Gotchas fields and its related ADR.
   If the ADR's reasoning isn't already clear from the ticket text, fetch it
   from the ADR database (`collection://688bcfcb-b078-4928-9e38-0bd0a8bd56f4`)
   too — the ADR is the authoritative decision, the ticket is just the
   implementation slice of it.
3. **Summarize before acting.** Report back to the user: ticket title, Why,
   Scope, Acceptance Criteria, Files, and any Gotchas — so scope can be
   corrected before code changes start.
4. **Cross-check the repo map.** Compare the ticket's "Files" list against the
   Repo Map in CLAUDE.md; flag anything that doesn't line up (missing
   dir/file, or the map itself looks stale).
5. **Plan.** For anything beyond a small single-file change, use
   EnterPlanMode to propose the approach and get sign-off before touching
   code.
6. **Mark In Progress, then implement.** Once any plan is approved, set the
   ticket's status to In Progress before making changes — check the status
   property's actual available options first (don't assume a field named
   "Status" exists, or that "In Progress" is one of its values, just because
   the ADR database has a similar field; if it's missing, ask the user what
   to use instead of inventing a value). This one doesn't need a confirmation
   round-trip — it's a start-of-work marker, not a content edit. Then
   implement, following existing repo conventions (see CLAUDE.md, especially
   the UI/UX section for anything touching `apps/web`).
7. **Keep the map current.** Per CLAUDE.md's repo-map rule, update that
   section if this ticket added, moved, or removed a directory, package, or
   route group.
8. **Mark In Review and ask for verification.** Once the implementation is
   complete and locally verified (tests/build pass; for `apps/web` UI
   changes, checked in the browser per the standard workflow), set the
   ticket's status to In Review and tell the user it's ready for them to
   check over.
9. **Mark Done — only after the user confirms.** If the user confirms the
   changes are good, set the status to Done. If they report a problem
   instead, keep working and leave the status at In Review (or move it back
   to In Progress if that's the clearer signal) until they confirm again. In
   every status change, only touch the status field itself — leave
   Why/Scope/Acceptance Criteria/Files/Gotchas untouched.
