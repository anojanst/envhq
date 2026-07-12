# EnvHQ — Roadmap

Phased sequencing of the work in [PLAN.md](./PLAN.md). Ordered to ship
self-contained, high-value pieces first, defer the heavy epics, and respect
dependencies. Milestones are independent unless a dependency is noted.

> **Rebrand note:** this project shipped Phase 0–M2 under the name **envsync**
> (domain `envsync.dev`, CLI package `@envsyncdev/cli`/command `envsync`, config
> dir `.envsync/`, env vars `ENVSYNC_*`). It has since been rebranded to
> **EnvHQ** (`envhq.dev`, npm package `envhq`, `.envhq/`, `ENVHQ_*`) — see the
> rebrand note in [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md). Historical entries
> below that describe what was literally shipped at the time (e.g. specific
> published package/version strings) are left as-is; forward-looking mentions
> use the current EnvHQ naming.

Legend: ✅ done · 🔜 next · ⏳ planned · 🧊 epic (own architecture pass)

---

## Phase 0 — v1 + polish  ✅ (shipped, as envsync)

- ✅ Monorepo, web app, CLI, shared parser
- ✅ Projects / environments / env_vars, server-side encryption
- ✅ CLI `login`/`link`/`push`/`pull`/`status`, deployed at `envsync.dev` (now `envhq.dev`)
- ✅ Design tokens + theme switcher (default light) + brand identity
- ✅ Web auto-creates `dev` env · multiline editor · top-center toasts

---

## M1 — CLI auth hardening  ✅ (shipped)

*Self-contained, security-critical, no dependencies. Good first milestone.*

- ✅ Browser loopback login + PKCE code exchange (PLAN §7)
- ✅ 7-day expiring tokens (`expires_at`, `token_expired`, auto-relogin)
- ✅ Token storage: OS keychain (`@napi-rs/keyring`) / `ENVSYNC_TOKEN` only —
  no plaintext file
- ✅ `/cli/authorize` approve page; `cli_auth_requests` table
- ✅ **Scoped + expiring PATs** for CI (PLAN §6 near-term) — project + read/write
  capability, enforced across all mutation routes

**Done when:** a new user runs `envsync login`, approves in the browser, and
`push`/`pull` work for 7 days then transparently re-auth; no token ever on disk.
— **Met.** CLI published as `@envsyncdev/cli@0.2.1`.

<details>
<summary><strong>Approach summary</strong> (read before picking up M2)</summary>

**Delivered as 3 PRs**, each independently reviewable:
1. **Server + web backend** — `api_tokens` extended with `expiresAt`/`kind`/
   `projectId`/`capability`; new `cli_auth_requests` table (one-time PKCE
   codes). `getUserId()` ([lib/auth.ts](../apps/web/src/lib/auth.ts)) now
   returns `{ userId, expired?, scope? }` instead of a bare string — every
   route that calls it checks `expired` first (→ `tokenExpired()` 401) then
   `!userId` (→ `unauthorized()` 401). New endpoints
   `/api/cli/authorize` (Clerk-session, mints one-time code) and
   `/api/cli/token` (public, PKCE-verifies + mints 7-day token) live in
   [lib/cli-auth.ts](../apps/web/src/lib/cli-auth.ts). Approve UI at
   `/cli/authorize` (inside the `(app)` group so it's session-protected).
2. **CLI** — new `packages/cli/src/auth/` (pkce, loopback listener, browser
   opener, shared `runLoginFlow`) and `token-store.ts` wrapping
   `@napi-rs/keyring`. `config.ts` no longer persists a token (legacy
   plaintext tokens auto-migrate into the keychain once, then get stripped).
   `api.ts` auto-retries once on `token_expired` by re-running the browser
   flow (skipped for `ENVSYNC_TOKEN`-sourced sessions — those just error with
   guidance to rotate).
3. **Scoped PATs** — `lib/access.ts` gained `isReadOnly(scope)` and
   `isFullAccess(scope)` guards. `isFullAccess` gates **account-level actions**
   (creating projects, creating/revoking tokens) so a leaked scoped or
   read-only PAT can't escalate. `isReadOnly` gates all mutation routes.
   `getOwned{Project,Environment,Var}` all take an optional `scope` so a
   project-scoped token 404s (not 403s) outside its project.

**Verified live** end-to-end against the real DB/server: PKCE exchange →
token mint, single-use code + wrong-verifier rejection, forced-expiry →
`token_expired`, the actual CLI binary's `login`/`whoami`/`status`/`logout`
round-tripping through the OS keychain with zero plaintext on disk, and full
scope/capability matrices (in-scope 200, cross-project 404, read-only 403,
escalation attempts 403).

**Gotchas hit along the way — worth knowing for future CLI work:**
- The CLI's `--version` was **hardcoded** in `index.ts` (`.version("0.1.0")`),
  totally disconnected from `package.json`. Fixed by baking
  `__ENVSYNC_VERSION__` from `package.json` via tsup's `define` (same pattern
  already used for `__ENVSYNC_DEFAULT_URL__` — see
  [tsup.config.ts](../packages/cli/tsup.config.ts) and
  [config.ts](../packages/cli/src/config.ts)). If you add more baked
  constants, follow that pattern rather than hardcoding.
- `@napi-rs/keyring` is a native addon (prebuilt per-platform binaries via
  `optionalDependencies`) — it must be `external` in tsup, not bundled. The
  CLI is no longer a single dependency-free file; Linux needs `libsecret`.
- **Publish order matters**: the CLI's default baked URL is
  `https://envsync.dev`. Deploy the web app's PR1 server changes *before*
  publishing a CLI version that calls `/cli/authorize` / `/api/cli/token`,
  or `envsync login` 404s in production for new installs.
- `npm publish` requires a version bump every time — can't republish the same
  semver. Bump `packages/cli/package.json`, `pnpm build` (from
  `packages/cli`), spot-check `node dist/index.js --version`, then publish.

</details>

## M2 — CLI-first project & env lifecycle  ✅ (shipped)

*Self-contained; unlocks the CLI-first workflow. Depends on M1 for auth UX only.*

- ✅ Unique project names + migration + `409` (PLAN §2) — `projects_user_id_name_uq`
  on `(userId, name)`, migration dedupes existing collisions first
  ([0002_public_whistler.sql](../apps/web/src/db/migrations/0002_public_whistler.sql)),
  API pre-checks + catches the race via Postgres `23505`, web project-create
  dialog already surfaces the message (no UI change needed)
- ✅ Multi-env workspace link (PLAN §4) — `.envsync/config.json` now holds
  `{ projectId, projectName, environments: { name → { id, file } }, default }`;
  `link` maps every environment in one go (default → `.env`, others →
  `.env.<name>`); `env map <env> <file>` adjusts one mapping; `push`/`pull`
  take a positional `[env]` (default → linked default) + `--all` (mutually
  exclusive with an explicit env or `--file`); `prod`/`production` envs prompt
  for confirmation unless `--yes`. Old single-env `.envsync.json` auto-migrates
  on first read.
- ✅ `envsync init` + `projects create <name>` (PLAN §2) — `--env dev,staging`
  (comma-separated, default `dev`), `--no-link` on `projects create` (default
  links); `init` defaults the name to the folder's basename, is idempotent
  (no-ops if already linked), and both write a `.envsync/` entry to
  `.gitignore` via `ensureGitignored()`
- ✅ `env create <name> [--from <env>]` clone + `env list` (PLAN §4) —
  `POST /api/projects/:id/environments` gained an optional `from` (source env
  id in the same project); `cloneVars()` ([env-store.ts](../apps/web/src/lib/env-store.ts))
  copies ciphertext/iv/authTag directly, no decrypt/re-encrypt. CLI: no
  auto-link, `--link` opts in (merges into the current link config if it's the
  same project, otherwise starts a fresh one); `--project <name>` targets a
  project other than the linked one without linking to it; `env list` shows
  the linked file mapping when applicable

**Done when:** you can `envsync init` a fresh folder and manage multiple
environments + files entirely from the terminal. — **Met.**

## M3 — Sync engine: cloud as source of truth  ⏳ (next up)

*The correctness core. Foundation for M4. Full design in [PLAN.md §1](./PLAN.md)
(read it before starting — this section is a summary, not a replacement).*

**Current gap this milestone closes:** today's `push` (CLI
[index.ts](../packages/cli/src/index.ts) → `apiClient.importEnv` →
[import/route.ts](../apps/web/src/app/api/environments/[id]/import/route.ts) →
`upsertMany` in [env-store.ts](../apps/web/src/lib/env-store.ts)) is a
**stateless upsert/merge only** — it never deletes a remote key, even one
removed from the local file, and there is no local record of what was synced
last (no base file, no version). `pull` just overwrites the target file with
whatever `exportEnv` returns — no diff, no conflict detection, no backup.
`env_vars` ([schema.ts](../apps/web/src/db/schema.ts)) has no `deleted_at`
column — deletion (`deletePairByKey` in `env-store.ts`) is already used by the
web UI's single-key delete, but hard-deletes with no trash/restore.

**Scope:**
- **Env-keyed base** — a per-environment `{ version, keys: [names] }` record
  (names only, never values — PLAN's cross-cutting invariant #2) written into
  `.envhq/` after every successful `push`/`pull`. CLI-owned, human-read-only,
  harmless if lost (degrades to merge-only per invariant #3).
- **Three-way `push`** (base / local / remote diff): `local − base` → add;
  `base − local` (still present remotely) → soft-delete; keys in both with a
  value that differs from the live remote value → update; a remote key never
  present in base → left untouched (this is what prevents a stale/partial
  local file from mass-deleting cloud state).
- **Soft-delete**: add `deleted_at` to `env_vars`, a **partial unique index**
  `WHERE deleted_at IS NULL` (so a deleted key's name can be re-created without
  colliding with the tombstoned row), restore, and a trash view (web UI, and/or
  `envhq` command — decide during implementation).
- **Non-clobbering `pull`** — required before M4 can build on it. On a
  conflict (local file has uncommitted-looking edits vs. the last-known base)
  either refuse, back up to `.env.bak`, or show a diff and ask — pick one
  default behavior and document it.
- **`envhq diff` / `status`** — preview added/changed/deleted before they
  happen. Confirm on deletions; extra confirm for sensitive envs (this can
  reuse/extend the `prod`/`production`-name guard already in `push`/`pull`
  from M2, at [index.ts](../packages/cli/src/index.ts)'s `confirmProdIfNeeded`).

**Known sharp edges (from PLAN §1, must be handled, not just noted):**
- Empty/partial local file → mass delete: mitigate with a confirm + threshold
  (e.g. "deleting >50% of keys"); trash makes it recoverable regardless.
- The partial unique index + `ON CONFLICT` target must match exactly, or
  re-creating a previously-deleted key will either 409 or silently resurrect
  the tombstoned row instead of inserting fresh.
- Exact conflict-resolution UX is explicitly **open** in PLAN §1 — deferred to
  M4's design pass, but non-clobbering `pull` here needs *some* safe default
  now (refuse is the simplest correct starting point if undecided).

**Done when:** deletions propagate correctly, partial files can't cause data
loss, and a pull never silently destroys local edits.

## M4 — Versioning ("git for env")  ⏳

*Depends on M3 (needs non-clobbering pull + soft-delete).*

- Per-env integer sequence + optimistic concurrency (base-version CAS) (PLAN §5)
- Full snapshot per version; commit messages; history / diff / rollback / blame
- Server-side key-level conflict reporting; rebase/replay resolution UX
- Web edits create versions (message/granularity policy)

**Done when:** every change is a versioned, message-tagged revision you can diff
and roll back, and concurrent pushes conflict safely at the key level.

## M5 — Teams & access control  🧊

*Foundational epic; access-layer refactor touches every route. Independent of the
sync milestones but large.*

- Org-owned projects; personal-org migration (PLAN §8)
- Clerk Organizations (membership + email invites + org roles)
- `access_grants` + `groups` + `group_members`; `getAccessibleProject(...)`
- Web: org switcher, members/groups admin, per-project Share dialog
- CLI + all routes honor grants; `env_scope` enforcement phased (prod-protection
  first)

**Done when:** an org admin can invite people, put them in groups, and grant
group/user access to specific projects with roles.

## M6 — Zero-knowledge encryption  🧊

*Largest epic; own architecture pass. Best after M5 (asymmetric keys designed for
sharing). Reshapes web viewing, import, clone, and conflict detection.*

- Envelope encryption; passphrase → Master Key → User Key → per-project DEK
- Device enrollment + keychain; API token becomes auth-only; Recovery Kit
- Client-side web decrypt + import; keyed HMAC tags for conflict equality
- Decide: DEK granularity, device-key mechanism, metadata encryption scope

**Done when:** the server can no longer decrypt any secret, and sharing works by
re-wrapping keys to members.

---

## Dependency graph

```
M1 (auth) ✅ ──┐
M2 (lifecycle) ──┤ (independent, ship early)
M3 (sync) ──► M4 (versioning)
M5 (teams) ── independent, foundational
M6 (zero-knowledge) ── after M5, largest
```

## Suggested order

**M1 → M2 → M3 → M4**, then **M5**, then **M6**. M5 can start in parallel with
M3/M4 if there's capacity, since it's on the access layer rather than the sync
engine. M6 is deliberately last — it's the biggest commitment and benefits from
M5's key model.

**Next up: M3** (see above for full scope, current-state gap analysis, and
sharp edges — a fresh agent should be able to start directly from that section
plus [PLAN.md §1](./PLAN.md)). It builds on M2's multi-env link config
(`.envhq/config.json`) and touches `env_vars` (new `deleted_at` column +
partial unique index), `env-store.ts`, the import/export routes, and the CLI's
`push`/`pull`.

M1 and M2 are fully shipped, but as of the **EnvHQ rebrand** the CLI package
itself changed name (`@envsyncdev/cli` → `envhq`, unscoped) and got a version
bump for the breaking config/env-var/keychain-service renames
(`packages/cli/package.json` is `0.4.0` locally). **Nothing has been published
under the new `envhq` name yet** — the last real npm install anyone could do is
still the old `@envsyncdev/cli@0.2.1`/`0.3.0`, which predates
`init`/`projects create`/`env create`/`env list` *and* the rebrand entirely.
Before relying on the CLI externally: build, spot-check `envhq --version` and
the legacy `.envsync/`/keychain migration, publish `envhq` fresh (see M1's
publish checklist above, using the new package name), and deprecate
`@envsyncdev/cli` on npm pointing at it. Ideally bundle this with M3's CLI
changes rather than as a separate release.
