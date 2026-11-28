# CLAUDE.md

Repo-specific guidance for Claude Code sessions working on EnvHQ.

## Repo Map

pnpm monorepo: `apps/*` + `packages/*` (see `pnpm-workspace.yaml`).

- `apps/web` — the product: Next.js app (UI + API routes + DB), package `@envhq/web`.
  - `openapi.yaml` — hand-written OpenAPI 3.1 spec, the source-of-truth contract for every route under `src/app/api` (ADR-010); lint with `pnpm --filter @envhq/web lint:openapi`
  - `src/app/(app)/` — authenticated app pages: `dashboard`, `projects` (incl. `[id]/access` and `[id]/deploy-keys`), `teams`, `settings`, `cli`, `ops` (staff-only, linked from nowhere, 404 to everyone else), `teams` (EnvHQ's own team management), `invite/[token]` (where an invite link lands)
  - `src/instrumentation.ts` — `register()` applies migrations at start when `ENVHQ_MIGRATE_ON_START=true` (the Docker image sets it; `src/db/migrate.ts`, behind an advisory lock); Next's `onRequestError` hook; every uncaught error in any route or page reaches `lib/observability.ts` through here, so a new route can't forget to report
  - `src/app/api/` — Next.js route handlers: `orgs`, `projects` (incl. `[id]/deploy-keys`), `environments`, `vars`, `groups`, `tokens`, `users`, `cli`, `me`, `health` (the uptime endpoint — unauthenticated), `ops` (staff-only metrics and issue muting), `invites` (accepting a team invite link)
  - `src/app/sign-in` — a single "Continue" to the OIDC provider (`sign-up` just redirects there); `src/app/auth/` — `sign-in` (start the OIDC flow), `callback` (finish it, write the profile, issue the session cookie), `sign-out` (POST only). Outside `api/` on purpose: browser redirects, not JSON
  - `src/middleware.ts` — the page sign-in gate: reads `envhq_session` (edge, no provider call), redirects with `redirect_url`, re-issues day-old sessions; on `/api` it only turns away pre-v2 CLIs (`lib/client-version.ts`)
  - `src/app/docs/` — public docs site (`getting-started`, `cli`, `ci`, `security`, `limitations`, `web-app`) — distinct from the internal `docs/` at repo root
  - `src/db/` — Drizzle: `schema.ts`, `migrations/`, `index.ts` client, `pool.ts` (connection-pool sizing and prepared-statement settings — pure, so it is testable; see `docs/OPERATIONS.md`)
  - `src/lib/` — core domain logic: `access.ts` / `grants.ts` (authz), `crypto.ts` / `project-keys.ts` / `user-keys.ts` / `deploy-keys.ts` (key management; `deploy-key-client.ts` is its browser half — it generates the keypair and seals, and is a separate module so a test can assert the private key never reaches the wire), `env-store.ts` / `version-store.ts` (secret storage), `auth.ts` (bearer token or `envhq_session` cookie — the one way a route learns who's calling) / `cli-auth.ts`, `oidc.ts` (OpenID Connect sign-in: discovery, PKCE, claims → profile, email-domain allow-list) / `session.ts` (EnvHQ's own encrypted session cookie — edge-safe; `SESSION_SECRET`), `public-url.ts` (the origin people use — `ENVHQ_PUBLIC_URL` behind a proxy or in Docker; every redirect, invite link and cookie `Secure` decision goes through it), `orgs.ts` (org roles — read live from Postgres) / `org-store.ts` (its SQL) / `org-admin.ts` (every team mutation and its invariants: one admin minimum, personal orgs are single-member, removal takes grants/groups/key wraps with it) / `org-routes.ts` (the `api/orgs/[id]/…` gate), `groups.ts`, `api.ts` / `client.ts`, `db-errors.ts` (driver-agnostic Postgres error checks, e.g. unique-violation), `perf.ts` (request-scoped query/provider-call measurement — counts and durations only, never SQL or parameters), `observability.ts` (error grouping, scrubbing and alert-once — same counts-only invariant, and the only place a message is allowed to reach storage), `ops-metrics.ts` (EnvHQ's own numbers, and the `ENVHQ_STAFF_USER_IDS` gate), `client-version.ts` (the `X-EnvHQ-Crypto: 2` check that refuses CLIs too old for today's encryption — edge-safe, no DB), `user-profiles.ts` (display names as the OIDC provider gave them at sign-in — decorative only, never an authorization input), `identity/` (who is signed in, and display details as of their last sign-in; `oidc.ts` is the adapter. Never orgs or roles)
  - `src/test-support/` — real-Postgres test infra (`db.ts`, `mock-db.setup.ts`, `mock-orgs.ts`, `profiles.ts` (seed `user_profiles`), `migrate.global-setup.ts`) plus fixture/seed helpers for the `authz-db`, `orgs-db` and `contract` vitest projects (`orgs-db` runs the real `lib/orgs.ts` over real `org_members` rows — `*.orgs-db.test.ts`); `contract/` holds the openapi.yaml-vs-live-routes contract suite; `perf/` holds the RM-5 baseline harness and RM-8's connection load test (its own `perf` vitest project, excluded from `pnpm test`); `ui.setup.ts` backs the `ui` project — happy-dom component tests named `*.render.test.tsx`, which is where render cost and re-render behaviour are pinned (RM-9)
  - `src/components/` — shared UI, incl. `components/ui` (primitives) and `components/landing`; `page-header.tsx` (the one page-header shape, plus `HeaderTabs`) and `project-header.tsx` (every project page: Variables / Access / Deploy keys tabs); `app-shell.tsx` (the signed-in frame: an icon rail on the warm `canvas`, the page in one floating panel, a bottom tab bar on phones — there is no sidebar); `encryption/` — `project-key-gate.tsx` (everything between signed-in and holding a project's key, handled inline: first-time setup, unlock, auto-creating an empty project's first key) and `encryption-flows.tsx` (the setup/unlock forms it shares with Settings → Encryption)
- `packages/cli` — published `envhq` CLI (push/pull secrets from a terminal)
  - `src/index.ts` — wiring only: it registers each command, in the order `--help` lists them
  - `src/commands/` — one module per command, each exporting `register(program)`; `projects` and `env` carry their own subcommands
  - `src/shared/` — helpers the commands share: `ui.ts` (prompts, `fail`), `link.ts`, `secrets.ts` (the client-side encryption boundary, including the deploy-key decrypt path `run`/`export` use in CI), `deploy-key.ts` (parses `ENVHQ_DEPLOY_KEY`), `github.ts` (Actions log masking and `GITHUB_ENV`/`GITHUB_OUTPUT` writes), `target.ts` (project/env resolution that works without a linked folder), `require.ts` (`--require`/`ENVHQ_REQUIRE` on `run`/`export` — names only, checked before anything is written or started), `resolve.ts`, `fs.ts`
  - `src/commands/cli-surface.fixture.txt` — the pinned `--help` output; regenerate deliberately with `UPDATE_FIXTURES=1 pnpm --filter envhq test`
- `packages/github-action` — the EnvHQ GitHub Action (RM-12): `action.yml` plus a thin Node entry that runs a pinned `envhq export`. Its `dist/` is committed, because GitHub runs it directly, and CI fails if `dist/` is stale. It is published by mirroring this directory into `envhq/envhq-action` (see its README)
- `packages/crypto` — `@envhq/crypto`, shared encryption primitives: approved algorithms only (AES-256-GCM, ECDH P-256, HKDF/PBKDF2/HMAC-SHA256), all through WebCrypto — no pure-JS crypto (see `docs/CRYPTO_SUITE.md`)
- `packages/parser` — `@envhq/parser`, env file parsing
- `.claude/commands/` — repo slash commands: `/recommend-next` (pick the next roadmap ticket) and `/implement <ticket>` (fetch it from Notion and build it)
- `Dockerfile` (repo root) — the self-hosted image: standalone Next build, non-root, migrates on start
- `deploy/` — `docker-compose.yml` + `envhq.env.example` for self-hosting, and `e2e/selfhost-smoke.sh` (boots the image with Postgres and a throwaway OIDC provider, signs in through the real redirect flow, makes a team, runs the published CLI against it; ports overridable with `APP_PORT`/`PG_PORT`/`OIDC_PORT`)
- `.github/workflows/` — CI (`ci.yml`), the self-hosted image smoke test (`selfhost.yml`), publishing that image to GHCR on a hand-pushed `product-v*` tag (`image.yml`), the weekly dependency audit (`audit.yml`), CLI publishing via Changesets (`release.yml`), CLA enforcement (`cla.yml`), the manual cross-OS GitHub Action acceptance run (`action-e2e.yml`, needs live deploy-key secrets)
- `.changeset/` — Changesets config and pending release notes for the published packages
- `docs/` (repo root) — internal planning docs: `PLAN.md`, `ROADMAP.md`, `SYSTEM_DESIGN.md`, `RELEASE_POLICY.md` (how the app deploys and the CLI is published), `DEPLOY_KEYS.md` (how CI decrypts without the server holding a key — the security design the Pipelines work builds on), `CRYPTO_SUITE.md` (why the crypto is approved-algorithms-only on WebCrypto, the formats, and the v1 → v2 clean break), `PERF_BASELINE.md` (the measured numbers every Performance ticket is compared against), `CI.md` (what CI enforces and why — typecheck, coverage floor, dependency audit), `OPERATIONS.md` (the `instances × pool max` connection ceiling, and what may be cached), `SELF_HOSTING_PLAN.md` (the agreed self-hosting design: OIDC-only sign-in with Clerk as envhq.dev's IdP, orgs moving into Postgres — not started)
- root `package.json` — workspace scripts fan out via `pnpm --filter`

Commands (run from repo root unless noted):
- `pnpm dev` / `pnpm build` — run/build the web app
- `pnpm --filter @envhq/web test:perf` — the performance baseline harness; refreshes the numbers in `docs/PERF_BASELINE.md` (needs `TEST_DATABASE_URL`)
- `pnpm typecheck` — `tsc --noEmit` across every package (web's needs a prior `pnpm build`:
  `next-env.d.ts` imports `.next/types/routes.d.ts`, which only a build generates)
- `pnpm --filter @envhq/web test:coverage` — the same tests plus the `src/lib` coverage floor
  that CI enforces (see `docs/CI.md`)
- `pnpm --filter @envhq/web test` / `test:watch` — vitest (the `authz-db` and `contract` projects need a real Postgres via `TEST_DATABASE_URL`, e.g. `postgres://envhq_test:envhq_test@localhost:5432/envhq_test`; the `ui` project runs `*.render.test.tsx` under happy-dom and needs nothing)
- `pnpm --filter @envhq/web lint` — eslint
- `pnpm --filter @envhq/web lint:openapi` — lints `openapi.yaml` with Redocly
- `pnpm db:generate` / `pnpm db:migrate` — Drizzle migrations
- `pnpm --filter @envhq/web db:studio` — Drizzle Studio
- `docker build -t envhq:e2e . && deploy/e2e/selfhost-smoke.sh envhq:e2e` — build the self-hosted image and run the end-to-end check
- `pnpm cli` — run the CLI locally
- `pnpm --filter envhq test` — CLI tests (`node --test`); builds first, since the surface test runs the real `dist/` binary. Keychain-backed cases skip where no OS keyring exists
- `pnpm --filter @envhq/github-action test` — rebuilds the action's `dist/` and tests it; commit the rebuilt `dist/` with any change to `src/`

**Keep this file current.** Before marking any task done, check whether it added/removed/moved a top-level directory or package, changed what a `src/lib` file is responsible for, added a new route group, or changed one of the invariants below. If so, update this file in the same change — don't defer it to a follow-up task.

## Invariants

Constraints that aren't visible from the code, and that a plausible-looking change
can break silently. Read these before editing crypto, `src/lib/access.ts`, or
anything the CLI talks to.

### Zero-knowledge: the server never holds a decryption key

Env values are encrypted **client-side** (web or CLI) under a per-project DEK that is
sealed to each member's P-256 public key; the server stores ciphertext and sealed
keys only, and has no path to plaintext. Treat this as the product's core claim, not
an implementation detail:

- `packages/crypto` and its callers are not to be rewritten as a side effect of
  another ticket. If a task seems to require the server decrypting a value, stop and
  raise it rather than designing around it.
- `packages/crypto` uses **only FIPS-approved algorithms, only through
  WebCrypto** (`crypto.subtle`) — the platform's module does the work, not
  JavaScript in this repo. Don't add a pure-JS primitive (`@noble/*`,
  libsodium, a hand-rolled hash) even for something small; if WebCrypto can't
  do it, raise it. EnvHQ isn't seeking certification — this is about not
  having visible gaps (`docs/CRYPTO_SUITE.md`). A consequence: browsers only
  expose WebCrypto over HTTPS or on localhost, so a self-hosted instance on
  plain HTTP can't encrypt.
- `apps/web/src/lib/crypto.ts` is **not** value encryption — it is CLI token
  generation and SHA-256 hashing. Only the hash is ever persisted.
- Variable **names** are stored unencrypted and are readable by anyone with database
  access. That is a known, accepted gap (ADR-012), not an oversight to "fix" casually.
- A project has **one** DEK. Someone may self-register a freshly generated DEK only as
  the project's *first* key (`api/projects/[id]/keys` refuses it once anyone holds one);
  later members get the existing DEK wrapped *for* them (reconciliation). The web app
  creates the first key automatically when an empty project is opened, so this server
  check is what stops two people doing that at once from splitting the project
  across two keys.
- The recovery phrase is shown exactly once, during setup. `setup()` unlocks the
  session before the recovery steps run, so anything rendering the setup wizard must
  keep it open across that change (see `project-key-gate.render.test.tsx`).

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

### Sign-in is OIDC only; EnvHQ issues its own session

EnvHQ signs people in only through OpenID Connect (`lib/oidc.ts`): Clerk acting
as an OIDC provider for envhq.dev, the customer's own provider when
self-hosted. Which provider is configuration (`OIDC_*`), never code.

- **Don't add a provider SDK** (Clerk's or anyone's) to `apps/web`. Anything a
  feature needs from the provider must come through standard OIDC claims at
  sign-in, or it doesn't work for self-hosted customers.
- After the callback, the provider is not consulted again: `envhq_session` (an
  encrypted JWT, `lib/session.ts`) is the session. Its only claim is the user
  id (`sub`). Provider tokens are used once and never stored.
- Post-sign-in redirects go through `safeReturnTo` — same-origin paths only.
- Build absolute URLs with `publicUrl()`, never `new URL(path, req.url)`: in
  the Docker image and behind a proxy `req.url` is the bind address
  (`0.0.0.0:3000`). The smoke test caught exactly this.
- Sign-out is POST-only, so a link or `<img>` can't log someone out.
- Sign-out must really sign out on every provider, and never depends on the
  provider's `end_session_endpoint` (Okta needs an ID token we don't keep,
  Entra/Keycloak need registration, Clerk and Google have none). It leaves
  `envhq_signed_out`; the next sign-in sends `OIDC_SIGN_OUT_PROMPT`
  (default `login`; Google ignores that, so `select_account` there). Only a
  successful callback clears it — or a provider error other than a cancel,
  so a provider that rejects the prompt can't lock people out.

### Cached identity is decorative; roles are not

`user_profiles` (RM-6) holds each user's name/email/avatar as their OIDC
provider stated it at their last sign-in (`app/auth/callback`). Nothing on a
request path asks the provider anything; a user who never signed in has no
row and shows as their raw id.

- **Nothing in `user_profiles` may become an access decision.** A stale row
  must only ever mislabel a name. Org role resolves live from `org_members` on
  every request (`lib/orgs.ts`) — do not add a role, membership or entitlement
  column to this table, and do not read it to answer "may they?".
- Org membership *is* cached, but only within a single request (React `cache()`
  in `lib/orgs.ts`). There is deliberately no cross-request TTL: a revoked
  admin staying admin for the length of a TTL is a real access consequence.
  The per-org fan-out was removed by passing the already-fetched role down, not
  by caching it longer.
- **Orgs live only in Postgres and change only through EnvHQ.** `orgs`,
  `org_members` and `org_invites` are authorization inputs — org admins get
  admin on every project in the org, so a wrong row is a cross-org leak. The
  identity provider says *who someone is* and nothing else: never sync org
  membership or roles from it (OIDC has no standard for it, and every
  provider differs). Teams change only via `lib/org-admin.ts` behind the
  `/teams` page and `api/orgs/[id]/…`. The `orgs-db` vitest project replays
  the access matrix against real `org_members` rows — a change to role
  resolution must pass it.

### Public pages are static; authenticated responses are never cached

Two RM-8 rules that a reasonable-looking change breaks without any error:

- **A single session read makes a whole route dynamic.** `/`, `/terms` and
  `/docs/**` are statically prerendered and served from the CDN. One `auth()`
  call on any of them — which is how the landing page used to bounce signed-in
  visitors — turns that page into a function invocation for every logged-out
  visitor. The landing redirect lives in `middleware.ts` for exactly this
  reason. `pnpm --filter @envhq/web build` shows `○` or `ƒ` per route; the
  public ones must all be `○`.
- **Every `api/` response carries `Cache-Control: private, no-store`**, from
  `json()` in `lib/api.ts`. These routes answer as the caller, so a shared
  cache holding one would serve one customer's data to another.
  `test-support/contract/helpers.ts` asserts it on every response, so a route
  that builds its own fails on its first contract test.

Pool sizing belongs with these: the database sees `instances × max`, not
`max`. See `docs/OPERATIONS.md` before changing `src/db/pool.ts`.

### Server-only modules

Reachable only from `src/app/api` (never import these into a client component):
`api.ts`, `auth.ts`, `cli-auth.ts`, `crypto.ts`, `db-errors.ts`, `identity/`, `project-keys.ts`,
`user-keys.ts`, `version-store.ts`. (`identity/` is also used by server-component pages.) The client-side pair is `client.ts` (browser fetch)
and `utils.ts`. `access.ts`, `env-store.ts`, `grants.ts`, `groups.ts` and `orgs.ts` are
used from both and must stay safe to import on the server.

### Frozen CLI wire contracts

Published CLI versions can't be updated by us, so an old binary must keep working
against today's server. These are frozen:

- The browser-login URL shape `/cli/authorize?port=&state=&challenge=` — built by
  `packages/cli/src/auth/login.ts`, served by
  `apps/web/src/app/(app)/cli/authorize/`, with the PKCE code exchange in
  `apps/web/src/lib/cli-auth.ts`.
- The `X-EnvHQ-Crypto: 2` header the CLI sends on every bearer request, and
  the 426 with an "update envhq" `error` that the server returns without it
  (`lib/client-version.ts`). That 426 is how a binary from before crypto
  suite v2 learns it must upgrade — old binaries print `error` verbatim. A
  future format change bumps the version here rather than breaking silently.
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
  (e.g. the theme toggle and account menu live on the nav rail, not a top
  bar that exists only to hold them) — don't keep a persistent bar around once its
  one job moves elsewhere.
- Complex, expandable, or multi-section content (per-row detail panels,
  multi-field forms, anything that can grow) belongs on its own page with a
  breadcrumb, not crammed into a `sm:max-w-md` dialog — modals are for quick,
  bounded actions (confirm, rename, single field), not management surfaces.
- The visual language (warm canvas, soft 16px cards, pastel tints): raised
  surfaces are `<Card>` or the `surface` utility (`globals.css`), never a bare
  `rounded-lg border`; project pastels come from `projectTint()` and
  environment colours from `envTone()` (`project-visuals.tsx`: prod rose,
  staging peach, dev mint) — pastels mark status and identity, never buttons,
  which stay emerald. A subtree can be forced dark with the `dark` class (the
  project page's side panel, `environment-panel.tsx`).
- Match existing patterns before inventing new ones: check how the same kind
  of thing is already solved elsewhere in `apps/web/src/app/(app)/` (e.g.
  `settings/groups` for a list-with-inline-mutation page,
  `projects/[id]/environments/[envId]/page.tsx` for the breadcrumb-header
  shape) before introducing a new component or convention.
- Sweat responsive states, not just the default one — the phone tab bar,
  the project panel stacking under the editor below `xl`, empty states, and
  loading states are part of "done," not follow-ups.
