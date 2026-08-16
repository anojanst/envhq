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
5. **Plan, then implement.** For anything beyond a small single-file change,
   use EnterPlanMode to propose the approach and get sign-off before editing.
   Follow existing repo conventions (see CLAUDE.md, especially the UI/UX
   section for anything touching `apps/web`).
6. **Keep the map current.** Per CLAUDE.md's repo-map rule, update that
   section if this ticket added, moved, or removed a directory, package, or
   route group.
7. **Verify, then mark done — with confirmation.** Once the implementation is
   complete and verified (tests/build pass; for `apps/web` UI changes, checked
   in the browser per the standard workflow), tell the user it's ready and
   ask them to confirm before touching Notion. On a clear yes, update the
   ticket's status property to Done/Complete. Check the data source's actual
   properties first — don't assume a field named "Status" exists just because
   the ADR database has one; if there's no status-like property, say so and
   ask the user how they want it tracked instead of inventing one. Only flip
   the status field itself — leave Why/Scope/Acceptance Criteria/Files/Gotchas
   untouched. If the user doesn't confirm, leave the ticket as-is.
