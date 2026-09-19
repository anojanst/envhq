# CLAUDE.md

Repo-specific guidance for Claude Code sessions working on EnvHQ.

## Repo Map

pnpm monorepo: `apps/*` + `packages/*` (see `pnpm-workspace.yaml`).

- `apps/web` — the product: Next.js app (UI + API routes + DB), package `@envhq/web`.
  - `openapi.yaml` — hand-written OpenAPI 3.1 spec, the source-of-truth contract for every route under `src/app/api` (ADR-010); lint with `pnpm --filter @envhq/web lint:openapi`
  - `src/app/(app)/` — authenticated app pages: `dashboard`, `projects`, `teams`, `settings`, `cli`
  - `src/app/api/` — Next.js route handlers: `orgs`, `projects`, `environments`, `vars`, `groups`, `tokens`, `users`, `cli`, `me`
  - `src/app/sign-in`, `src/app/sign-up` — Clerk-hosted auth pages
  - `src/app/docs/` — public docs site (`getting-started`, `cli`, `security`, `limitations`, `web-app`) — distinct from the internal `docs/` at repo root
  - `src/db/` — Drizzle: `schema.ts`, `migrations/`, `index.ts` client
  - `src/lib/` — core domain logic: `access.ts` / `grants.ts` (authz), `crypto.ts` / `project-keys.ts` / `user-keys.ts` (key management), `env-store.ts` / `version-store.ts` (secret storage), `auth.ts` / `cli-auth.ts`, `orgs.ts`, `groups.ts`, `api.ts` / `client.ts`, `db-errors.ts` (driver-agnostic Postgres error checks, e.g. unique-violation), `perf.ts` (request-scoped query/Clerk measurement — counts and durations only, never SQL or parameters)
  - `src/test-support/` — real-Postgres test infra (`db.ts`, `mock-db.setup.ts`, `mock-orgs.ts`, `mock-clerk.setup.ts`, `migrate.global-setup.ts`) plus fixture/seed helpers for the `authz-db` and `contract` vitest projects; `contract/` holds the openapi.yaml-vs-live-routes contract suite; `perf/` holds the RM-5 baseline harness (its own `perf` vitest project, excluded from `pnpm test`)
  - `src/components/` — shared UI, incl. `components/ui` (primitives) and `components/landing`
- `packages/cli` — published `envhq` CLI (push/pull secrets from a terminal)
  - `src/index.ts` — wiring only: it registers each command, in the order `--help` lists them
  - `src/commands/` — one module per command, each exporting `register(program)`; `projects` and `env` carry their own subcommands
  - `src/shared/` — helpers the commands share: `ui.ts` (prompts, `fail`), `link.ts`, `secrets.ts` (the client-side encryption boundary), `resolve.ts`, `fs.ts`
  - `src/commands/cli-surface.fixture.txt` — the pinned `--help` output; regenerate deliberately with `UPDATE_FIXTURES=1 pnpm --filter envhq test`
- `packages/crypto` — `@envhq/crypto`, shared encryption primitives (noble libs)
- `packages/parser` — `@envhq/parser`, env file parsing
- `.claude/commands/` — repo slash commands: `/recommend-next` (pick the next roadmap ticket) and `/implement <ticket>` (fetch it from Notion and build it)
- `.github/workflows/` — CI (`ci.yml`), CLI publishing via Changesets (`release.yml`), CLA enforcement (`cla.yml`)
- `.changeset/` — Changesets config and pending release notes for the published packages
- `docs/` (repo root) — internal planning docs: `PLAN.md`, `ROADMAP.md`, `SYSTEM_DESIGN.md`, `RELEASE_POLICY.md` (how the app deploys and the CLI is published), `DEPLOY_KEYS.md` (how CI decrypts without the server holding a key — the security design the Pipelines work builds on), `PERF_BASELINE.md` (the measured numbers every Performance ticket is compared against)
- root `package.json` — workspace scripts fan out via `pnpm --filter`

Commands (run from repo root unless noted):
- `pnpm dev` / `pnpm build` — run/build the web app
- `pnpm --filter @envhq/web test:perf` — the performance baseline harness; refreshes the numbers in `docs/PERF_BASELINE.md` (needs `TEST_DATABASE_URL`)
- `pnpm --filter @envhq/web test` / `test:watch` — vitest (the `authz-db` and `contract` projects need a real Postgres via `TEST_DATABASE_URL`, e.g. `postgres://envhq_test:envhq_test@localhost:5432/envhq_test`)
- `pnpm --filter @envhq/web lint` — eslint
- `pnpm --filter @envhq/web lint:openapi` — lints `openapi.yaml` with Redocly
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations
- `pnpm --filter @envhq/web db:studio` — Drizzle Studio
- `pnpm cli` — run the CLI locally
- `pnpm --filter envhq test` — CLI tests (`node --test`); builds first, since the surface test runs the real `dist/` binary. Keychain-backed cases skip where no OS keyring exists

**Keep this file current.** Before marking any task done, check whether it added/removed/moved a top-level directory or package, changed what a `src/lib` file is responsible for, added a new route group, or changed one of the invariants below. If so, update this file in the same change — don't defer it to a follow-up task.

## Invariants

Constraints that aren't visible from the code, and that a plausible-looking change
can break silently. Read these before editing crypto, `src/lib/access.ts`, or
anything the CLI talks to.

### Zero-knowledge: the server never holds a decryption key

Env values are encrypted **client-side** (web or CLI) under a per-project DEK that is
sealed to each member's X25519 public key; the server stores ciphertext and sealed
keys only, and has no path to plaintext. Treat this as the product's core claim, not
an implementation detail:

- `packages/crypto` and its callers are not to be rewritten as a side effect of
  another ticket. If a task seems to require the server decrypting a value, stop and
  raise it rather than designing around it.
- `apps/web/src/lib/crypto.ts` is **not** value encryption — it is CLI token
  generation and SHA-256 hashing. Only the hash is ever persisted.
- Variable **names** are stored unencrypted and are readable by anyone with database
  access. That is a known, accepted gap (ADR-012), not an oversight to "fix" casually.

### Access control: `undefined` means 404, whichever reason

Every read/write path goes through `apps/web/src/lib/access.ts`. Its rules:

- A lookup returns `undefined` both when the row doesn't exist **and** when the
  caller's role doesn't meet `requiredRole`. Callers must treat both as 404 — that's
  deliberate, so a Viewer probing something they can't edit learns nothing a stranger
  wouldn't. Don't "improve" this into a 403.
- A grant's per-environment `env_scope` **caps** the resolved role and never escalates
  it (`capRoleForEnv`). A group grant capped to Viewer in `prod` can't be overridden by
  an uncapped direct grant.
- `isReadOnly` / `isFullAccess` gate *token capability* (read vs write, scoped vs not)
  and are orthogonal to org role. A project-scoped PAT resolves to `undefined` — 404 —
  everywhere outside its project.
- The matrix is pinned by `access-matrix.fixtures.json` and the `authz-db` vitest
  project against real Postgres. Changing a rule means changing a fixture; if a change
  doesn't move a fixture, suspect it isn't doing what you think.

### Server-only modules

Reachable only from `src/app/api` (never import these into a client component):
`api.ts`, `auth.ts`, `cli-auth.ts`, `crypto.ts`, `db-errors.ts`, `project-keys.ts`,
`user-keys.ts`, `version-store.ts`. The client-side pair is `client.ts` (browser fetch)
and `utils.ts`. `access.ts`, `env-store.ts`, `grants.ts`, `groups.ts` and `orgs.ts` are
used from both and must stay safe to import on the server.

### Frozen CLI wire contracts

Published CLI versions can't be updated by us, so an old binary must keep working
against today's server. These are frozen:

- The browser-login URL shape `/cli/authorize?port=&state=&challenge=` — built by
  `packages/cli/src/auth/login.ts`, served by
  `apps/web/src/app/(app)/cli/authorize/`, with the PKCE code exchange in
  `apps/web/src/lib/cli-auth.ts`.
- The literal `token_expired` string on a 401 (`apps/web/src/lib/api.ts` →
  `packages/cli/src/api.ts`). The CLI branches on it to decide whether to re-login
  transparently; any other 401 body means "your token is invalid", not "refresh me".
- Existing flag and argument names on every command, and the keychain service names
  `envhq` / `envsync` (the legacy name is still read so upgrading doesn't log people
  out).
- The `.envhq/config.json` link file and its two legacy predecessors
  (`.envsync/config.json`, `.envsync.json`), which are auto-migrated on read.

Adding a flag or a route is fine. Renaming or removing one is a breaking change for
everyone who already installed the CLI from npm.

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
