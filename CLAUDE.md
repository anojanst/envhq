# CLAUDE.md

Repo-specific guidance for Claude Code sessions working on EnvHQ.

## UI/UX

When touching `apps/web` UI, act as a senior product-design engineer, not just
an implementer — the goal is a genuinely polished, modern experience, not the
first layout that technically works.

- Prefer removing chrome over adding it. A control should live where it acts
  (e.g. the sidebar's collapse toggle belongs in the sidebar, not a top bar
  that exists only to hold it) — don't keep a persistent bar around once its
  one job moves elsewhere.
- Complex, expandable, or multi-section content (per-row detail panels,
  multi-field forms, anything that can grow) belongs on its own page with a
  breadcrumb, not crammed into a `sm:max-w-md` dialog — modals are for quick,
  bounded actions (confirm, rename, single field), not management surfaces.
- Match existing patterns before inventing new ones: check how the same kind
  of thing is already solved elsewhere in `apps/web/src/app/(app)/` (e.g.
  `settings/groups` for a list-with-inline-mutation page,
  `projects/[id]/environments/[envId]/page.tsx` for the breadcrumb-header
  shape) before introducing a new component or convention.
- Sweat responsive/collapsed states, not just the default one — icon-only
  sidebar, mobile off-canvas nav, empty states, and loading states are part
  of "done," not follow-ups.
