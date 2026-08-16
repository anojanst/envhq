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
  - `src/lib/` — core domain logic: `access.ts` / `grants.ts` (authz), `crypto.ts` / `project-keys.ts` / `user-keys.ts` (key management), `env-store.ts` / `version-store.ts` (secret storage), `auth.ts` / `cli-auth.ts`, `orgs.ts`, `groups.ts`, `api.ts` / `client.ts`, `db-errors.ts` (driver-agnostic Postgres error checks, e.g. unique-violation)
  - `src/test-support/` — real-Postgres test infra (`db.ts`, `mock-db.setup.ts`, `mock-orgs.ts`, `mock-clerk.setup.ts`, `migrate.global-setup.ts`) plus fixture/seed helpers for the `authz-db` and `contract` vitest projects; `contract/` holds the openapi.yaml-vs-live-routes contract suite
  - `src/components/` — shared UI, incl. `components/ui` (primitives) and `components/landing`
- `apps/app` — the new dashboard SPA per ADR-005, package `@envhq/app`: Vite + React 19 + TanStack Router + `@clerk/clerk-react`, static-only build (no server runtime, later `go:embed`-ed into the Go API binary per ADR-004). Ships a strict CSP (`script-src 'self'`, no `unsafe-inline`/`unsafe-eval`) from the first commit — Clerk bundles `@clerk/clerk-js` locally via the `Clerk` prop (`src/components/clerk-theme-provider.tsx`) rather than hot-loading it from Clerk's CDN, specifically to keep that CSP holding. **Consequence: Clerk's hosted UI components (`<SignIn>`, `<SignUp>`, `<UserButton>`, `<OrganizationProfile>`, etc.) can't be used here** — they come from a separate, undocumented `@clerk/ui` package this self-hosting path doesn't wire up, and throw at render time. Every Clerk-related UI surface (auth forms, a future user menu, org/teams management) must be built custom via headless hooks (`useSignIn`, `useSignUp`, `useUser`, `useOrganization`, `useClerk().signOut()`) — see `src/routes/sign-in.tsx` / `sign-up.tsx` for the pattern. The shared design-system layer (HQ-60) now lives here too: `src/components/ui/**` (shadcn/base-ui primitives, ported from `apps/web`), `app-shell.tsx` (wired into `_protected.tsx`, wraps every authenticated route — no `CryptoSessionProvider`/`<UserButton>`, see its file comment), `theme-provider.tsx` / `theme-toggle.tsx` (hand-rolled, replaces `next-themes`), `brand.tsx`, and `globals.css` for tokens (`@/*` path alias added to `tsconfig.app.json`/`vite.config.ts` to support it). `auth-shell.tsx` is ported but unwired — it needs the `.public-dark` marketing token scope, which stays out of `apps/app` (marketing-only, owned by the future `apps/site`). Route stubs only for now under `src/routes/` for the actual page content (HQ-61–64 port the real pages).
- `packages/cli` — published `envhq` CLI (push/pull secrets from a terminal)
- `packages/api-client` — `@envhq/api-client`, types generated from `apps/web/openapi.yaml` via `openapi-typescript` (ADR-010), plus a thin `openapi-fetch` wrapper (`createApiClient`, browser use only via `apps/app/src/lib/api-client.ts`). `pnpm --filter @envhq/api-client generate` regenerates the committed `src/generated/schema.ts`; CI's `api-client` job fails if it's stale. `packages/cli` imports only `@envhq/api-client/types` (type-only, excluded from its bundle) and keeps its own hand-rolled transport in `src/api.ts`.
- `packages/crypto` — `@envhq/crypto`, shared encryption primitives (noble libs)
- `packages/parser` — `@envhq/parser`, env file parsing
- `docs/` (repo root) — internal planning docs: `PLAN.md`, `ROADMAP.md`, `SYSTEM_DESIGN.md`
- root `package.json` — workspace scripts fan out via `pnpm --filter`

Commands (run from repo root unless noted):
- `pnpm dev` / `pnpm build` — run/build the web app
- `pnpm dev:app` / `pnpm build:app` — run/build the new SPA (`apps/app`)
- `pnpm --filter @envhq/web test` / `test:watch` — vitest (the `authz-db` and `contract` projects need a real Postgres via `TEST_DATABASE_URL`, e.g. `postgres://envhq_test:envhq_test@localhost:5432/envhq_test`)
- `pnpm --filter @envhq/web lint` — eslint
- `pnpm --filter @envhq/web lint:openapi` — lints `openapi.yaml` with Redocly
- `pnpm generate:api-client` — regenerate the OpenAPI-derived client types; re-run and commit after any `apps/web/openapi.yaml` change (CI's `api-client` job enforces this)
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations
- `pnpm --filter @envhq/web db:studio` — Drizzle Studio
- `pnpm cli` — run the CLI locally

**Keep this map current.** Before marking any task done, check whether it added/removed/moved a top-level directory or package, changed what a `src/lib` file is responsible for, or added a new route group. If so, update this section in the same change — don't defer it to a follow-up task.

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
