# EnvHQ docs

Design and reference documentation for EnvHQ (formerly envsync — see the
rebrand note in [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md)).

| Doc | What it is | Read it when |
|---|---|---|
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | **As-built** reference — the system that exists today (architecture, data model, API, CLI, deployment). | Starting any session; onboarding; before changing existing behavior. |
| [PLAN.md](./PLAN.md) | Design spec for **decided-but-not-yet-built** features, with rationale, rules, and open questions. | Designing or implementing a planned feature. |
| [ROADMAP.md](./ROADMAP.md) | Phased sequencing of the plan into milestones (M1–M6) with dependencies. | Prioritizing what to build next. |
| [RELEASE_POLICY.md](./RELEASE_POLICY.md) | How the app is deployed and the CLI is published — versioning, tagging, and migration constraints. | Publishing the CLI; deploying; writing a migration. |
| [DEPLOY_KEYS.md](./DEPLOY_KEYS.md) | The security design for **how CI decrypts** without EnvHQ ever holding a decryption key — deploy keys, scope, rotation, revocation, and the designs rejected. | Building anything in the Pipelines workstream; before proposing any server-side decrypt. |
| [PERF_BASELINE.md](./PERF_BASELINE.md) | The measured performance baseline — query counts, Clerk call counts and timings per route, with what each number is and isn't. | Starting any Performance ticket; before claiming something got faster. |
| [OPERATIONS.md](./OPERATIONS.md) | The connection ceiling — how many database connections the app may open and what to change when that gets close — and which responses may be cached. | Sizing the pool; moving to a pooled connection string; connection exhaustion; before caching anything. |
| [SELF_HOSTING_PLAN.md](./SELF_HOSTING_PLAN.md) | The agreed self-hosting design: EnvHQ signs in only through OIDC (Clerk as envhq.dev's provider, the customer's IdP when self-hosted), orgs move into Postgres, then Docker packaging — six phases; phases 1 (identity seam) and 2 (orgs in Postgres) done. | Anything touching sign-in, `lib/orgs.ts`, Clerk, or packaging. |
| [CI.md](./CI.md) | What CI enforces and why — the typecheck, coverage-floor and dependency-audit gates, and how to change one honestly. | Changing a CI gate; a coverage or audit failure you did not expect. |

**New session? Start with [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md).** It's the
canonical picture of the current system and is kept in sync with the code, so it
replaces re-exploring the codebase from scratch.

> Keep these updated as the code changes: when a planned item ships, move it from
> PLAN/ROADMAP into SYSTEM_DESIGN (and update the roadmap status).
