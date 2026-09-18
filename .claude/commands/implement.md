---
description: Fetch a ticket from the EnvHQ roadmap in Notion and implement it
argument-hint: <ticket name>
---

Ticket to implement: $ARGUMENTS

1. **Find the ticket.** Search the "Roadmap 2026 — SaaS" database in Notion
   (data source `collection://b54470c6-1d92-48d4-ac0c-2e8f7121884f`, at
   https://app.notion.com/p/38e30b8798c143c2a2022cea15f5ef69) for a ticket
   whose title matches "$ARGUMENTS". Match loosely (substring/fuzzy) — the user
   may not type the exact title. If more than one ticket plausibly matches,
   list the candidates and ask which one via AskUserQuestion before
   continuing. If none match, say so and stop rather than guessing.
2. **Fetch full detail.** Open the matched ticket page and read its Why /
   Scope / Acceptance criteria / Gotchas, and check its "Depends on" — if a
   blocking ticket isn't Done, say so before writing code.
3. **Check the decision record if one applies.** Seven ADRs still govern this
   codebase (`collection://688bcfcb-b078-4928-9e38-0bd0a8bd56f4`): split
   licensing, the CLA, HttpOnly session auth, the OpenAPI contract, metadata
   encryption, platform sync, and ephemeral pipeline injection. Anything marked
   **Rejected** there is abandoned history from the reverted self-hosting and
   Go-rewrite work — never build against it.
4. **Summarize before acting.** Report back: ticket title, Why, Scope,
   Acceptance criteria and Gotchas, so scope can be corrected before code
   changes start.
5. **Cross-check the repo map.** Compare what the ticket touches against the
   Repo Map in CLAUDE.md; flag anything that doesn't line up (a missing file,
   or the map itself looking stale).
6. **Plan, then implement.** For anything beyond a small single-file change,
   use EnterPlanMode to propose the approach and get sign-off before editing.
   Follow existing repo conventions (see CLAUDE.md, especially the UI/UX
   section for anything touching `apps/web`).
7. **Respect the invariants.** The server never holds a key that can decrypt a
   customer's values, and `packages/crypto` and its callers are not to be
   rewritten as a side effect of another ticket. If a ticket seems to require
   breaking either, stop and raise it.
8. **Keep the map current.** Per CLAUDE.md's repo-map rule, update that section
   if this ticket added, moved or removed a directory, package or route group.
9. **Don't touch Notion.** Leave the ticket's fields and status alone unless
   the user explicitly asks — editing the ticket page is modifying shared
   content and needs confirmation first.
