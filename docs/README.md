# env-sync docs

Design and reference documentation for env-sync.

| Doc | What it is | Read it when |
|---|---|---|
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | **As-built** reference — the system that exists today (architecture, data model, API, CLI, deployment). | Starting any session; onboarding; before changing existing behavior. |
| [PLAN.md](./PLAN.md) | Design spec for **decided-but-not-yet-built** features, with rationale, rules, and open questions. | Designing or implementing a planned feature. |
| [ROADMAP.md](./ROADMAP.md) | Phased sequencing of the plan into milestones (M1–M6) with dependencies. | Prioritizing what to build next. |

**New session? Start with [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md).** It's the
canonical picture of the current system and is kept in sync with the code, so it
replaces re-exploring the codebase from scratch.

> Keep these updated as the code changes: when a planned item ships, move it from
> PLAN/ROADMAP into SYSTEM_DESIGN (and update the roadmap status).
