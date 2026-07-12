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

## M3 — Sync engine: cloud as source of truth  ✅ (shipped)

*The correctness core. Foundation for M4. Full design in [PLAN.md §1](./PLAN.md).*

- ✅ **Env-keyed base** — `.envhq/` holds a per-environment `{ version, keys }`
  record (names only, never values), written after every successful
  `push`/`pull` (`readBase`/`writeBase` in
  [index.ts](../packages/cli/src/index.ts))
- ✅ **Three-way `push`** (`computeThreeWayDiff`) — `local − base` → add;
  `base − local` (∩ remote) → soft-delete; changed-vs-live-remote → update; a
  remote key never in base → left untouched. Live remote state is re-read on
  every push so the diff and the CAS version are computed against the same
  fresh snapshot, not the stale on-disk base
- ✅ **Soft-delete** — `env_vars.deleted_at` + a **partial unique index**
  `env_vars_environment_key_uq` on `(environment_id, key) WHERE deleted_at IS
  NULL` ([schema.ts](../apps/web/src/db/schema.ts)) so a deleted key's name
  can be re-created without colliding with its tombstone. Trash/restore ended
  up superseded by M4's full version rollback rather than a separate trash
  view — restoring a version restores any keys deleted since
- ✅ **Non-clobbering `push`** — conflicts are detected via the CAS version
  passed to `/commit` (see M4); a stale base 409s with the live conflicting
  keys/values rather than silently overwriting
- ✅ **`envhq diff` / `status`** — `diff` previews add/update/delete against
  the live remote without applying; deletions and prod/production envs
  prompt for confirmation (`confirmDeletions`, `confirmProdIfNeeded`) unless
  `--yes`

**Done when:** deletions propagate correctly, partial files can't cause data
loss, and a pull never silently destroys local edits. — **Met**, with the
conflict story resolved via M4's CAS rather than a separate pre-M4
mechanism (the two milestones landed together — see commits `188737c`
through `f2df816`).

## M4 — Versioning ("git for env")  ✅ (shipped)

*Depends on M3 (needs non-clobbering pull + soft-delete).*

- ✅ Per-env integer sequence + optimistic concurrency — `commitVersion` in
  [version-store.ts](../apps/web/src/lib/version-store.ts) does an atomic
  `UPDATE ... WHERE version = $baseVersion RETURNING version` as the
  linearization point (no multi-statement transactions on the neon-http
  driver), shared by the plain commit route and rollback
- ✅ Full snapshot per version (`environmentVersions.snapshot`); commit
  messages; `envhq history` / `diff` / `rollback` CLI commands + a version
  history panel in the web UI
  ([environment-history.tsx](../apps/web/src/app/(app)/projects/[id]/environments/[envId]/environment-history.tsx))
- ✅ Server-side key-level conflict reporting — a stale `baseVersion` on
  `POST /api/environments/[id]/commit` 409s with `currentVersion` +
  `serverPairs` (only the keys actually in conflict); CLI prints a
  yours-vs-server diff and tells the user to `pull` before retrying (no
  auto rebase/replay — conflicts are surfaced, not auto-resolved)
- ✅ Web edits (single-key add/edit) go through the same `commitVersion` path
  via `POST /api/environments/[id]/vars`, so manual web changes are versioned
  too, one version per save

**Done when:** every change is a versioned, message-tagged revision you can diff
and roll back, and concurrent pushes conflict safely at the key level. — **Met.**

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
M3 (sync) ✅──► M4 (versioning) ✅
M5 (teams) ── independent, foundational, next up
M6 (zero-knowledge) ── after M5, largest
```

## Suggested order

**M1 → M2 → M3 → M4**, then **M5**, then **M6**. M1–M4 are done. M6 is
deliberately last — it's the biggest commitment and benefits from M5's key
model.

**Next up: M5** (Teams & access control — see above for scope; it's a 🧊
foundational epic, so read [PLAN.md §8](./PLAN.md) in full and do a design
pass before writing code). It's independent of the sync milestones but large:
org-owned projects + a personal-org migration, Clerk Organizations, new
`access_grants`/`groups`/`group_members` tables, a `getAccessibleProject(...)`
access-layer refactor that touches every route, plus CLI and web surface
(org switcher, members/groups admin, per-project Share dialog).

M1–M4 are fully shipped. The CLI package is published on npm as `envhq`
(currently `0.6.0`, published under the post-rebrand name — the earlier
"nothing published under `envhq` yet" warning is stale and has been removed).
`packages/cli/package.json` is the source of truth for the current published
version; bump it before any future publish per M1's publish checklist above.
