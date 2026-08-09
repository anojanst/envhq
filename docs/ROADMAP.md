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

## M5 — Teams & access control  🧊 ✅ (shipped, as staged PRs)

*Foundational epic; access-layer refactor touches every route. Independent of the
sync milestones but large.*

- ✅ **PR1 — org-owned data model + access-layer rewrite.** Every user gets a
  real Clerk Organization as their personal org (`getOrCreatePersonalOrg` /
  `resolveDefaultOrgId` in [lib/orgs.ts](../apps/web/src/lib/orgs.ts), raced
  via a `personal_orgs(user_id PK, org_id)` mapping table + `INSERT ...
  ON CONFLICT DO NOTHING` — plain Postgres advisory locks / `db.transaction()`
  aren't available on the `neon-http` driver, see
  [version-store.ts](../apps/web/src/lib/version-store.ts)'s CAS comment for
  why). `projects.orgId` is now the auth scope (`NOT NULL`, unique per org,
  migrated via `0005`/`0006`/`0007` +
  [scripts/backfill-personal-orgs.ts](../apps/web/scripts/backfill-personal-orgs.ts)).
  New `groups`/`group_members`/`access_grants` tables exist (schema only, no
  CRUD yet). `lib/access.ts`'s `getOwnedProject/Environment/Var` are replaced
  by `getAccessibleProject/Environment/Var(userId, id, requiredRole, scope)` —
  Clerk org admin/owner ⇒ automatic `"admin"`, else the highest direct/group
  `access_grants` role; `undefined` (→404) covers both "doesn't exist" and
  "role too low," same as before. Every route that used to check
  `eq(projects.userId, userId)` now resolves org role instead, including the
  three hand-rolled leak sites found during the access-layer audit
  (`api/projects/route.ts` list+create, `dashboard/page.tsx` — the one real
  isolation bug this PR fixes, since that page bypassed the access layer
  entirely and would have shown every user the same project list post-org-
  migration if left unfixed).
- ✅ **PR2 — direct user sharing.** Scoped down from the original "groups CRUD
  + Share dialog" plan to **direct user grants only** — group-based sharing
  is deferred so this PR ships a complete, testable vertical slice rather
  than growing groups + grants + UI together (`groups`/`group_members` stay
  schema-only). New `lib/grants.ts` (`listGrants`/`upsertGrant`/`deleteGrant`,
  the last two built on `access_grants`'s `(projectId, subjectType,
  subjectId)` unique constraint from PR1 via `ON CONFLICT DO UPDATE`).
  Three new admin-gated routes under `api/projects/[id]/access/*`: list +
  upsert grants, revoke a grant, and list org members (via Clerk's
  org-scoped `getOrganizationMembershipList`, distinct from the user-scoped
  version PR1 already uses for personal-org lookup) to populate the picker.
  A `POST` validates the target is actually an org member
  (`getClerkOrgRole`) before granting — grants can't reach outside the org.
  Web: a "Manage access" entry on the project page's dropdown opens
  `share-dialog.tsx` (list current grants with inline role change + revoke,
  plus an add-member form). Verified live end-to-end by a second, brand-new
  Clerk account signing up, its personal org auto-provisioning inline
  (no backfill needed), creating a project, and opening Manage access
  successfully — the first real multi-tenant proof since PR1 (which could
  only be reasoned about statically, having no second account to test with).
- ✅ **PR3 — groups CRUD.** Scoped down again, same reasoning as PR2: groups
  are now a real, manageable thing (create/delete, add/remove members) but
  **not yet wired into project sharing** — `access_grants.subjectType:
  'group'` still has no writer (`resolveGrantRole` in `lib/access.ts`
  already reads it, forward-compatible since PR1). New `lib/groups.ts`
  (`listGroups`/`createGroup`/`deleteGroup`/`listGroupMembers`/
  `addGroupMember`/`removeGroupMember`). Five new routes: `api/groups`
  (list/create), `api/groups/[id]` (delete), `api/groups/[id]/members`
  (list/add), `api/groups/[id]/members/[userId]` (remove), and
  `api/orgs/members` — the first genuinely org-scoped (non-project)
  endpoint, distinct from PR2's project-scoped member picker. Every group
  route is gated on **Clerk org admin**, not a project `access_grants`
  role — groups are org-level, there's no project in scope (same gate
  `api/projects/route.ts` POST already uses for project creation). Web: a
  new Settings > Groups page (`groups-manager.tsx`, mirrors
  `tokens-manager.tsx`'s list-with-inline-mutation shape) plus a small
  `settings/layout.tsx` tab strip (Tokens / Groups) so it's reachable —
  `/settings` previously had exactly one destination and no way to get to a
  second. Verified live end-to-end: created a group, opened the org-members
  picker, added a real second member, confirmed the list refreshed.
- ✅ **PR3b — grant to group in the Share dialog.** `access_grants.subjectType:
  'group'` finally gets a writer. `lib/grants.ts`'s `GrantRow`/`upsertGrant`
  now carry `subjectType`; `listGrants` returns both kinds. New
  `getGroupNames` batch lookup in `lib/groups.ts` mirrors `resolveDisplayNames`
  so `api/projects/[id]/access/route.ts`'s GET can resolve a grant's display
  name the same way regardless of subject kind; its POST validates a group
  target via `getGroup(orgId, subjectId)` (the group-grant equivalent of
  "can't reach outside the org"). New project-scoped
  `api/projects/[id]/access/groups` route feeds the Share dialog's group
  picker — **not** the generic `api/groups` (deliberately: that route
  resolves org via the caller's own context, which can differ from the
  *project's* org once more than one org is in play, so it would silently
  list the wrong org's groups; this route resolves from
  `owned.project.orgId` instead, same pattern as PR2's `.../access/members`).
  `share-dialog.tsx`'s picker is now one `<select>` with "People"/"Groups"
  `<optgroup>`s. **Found and fixed during live testing**: `api/groups/*`,
  `api/orgs/members`, and `settings/groups/page.tsx` (all from PR3) still
  hardcoded `resolveDefaultOrgId` (personal org only), never updated for
  PR4's active-org switcher — so groups management was silently stuck on
  your personal org regardless of which org was actually active, which is
  what made a just-created group invisible to a project living in a
  different org. Fixed by switching all of them to the same
  `resolveRequestedOrgId(userId, activeOrgId)` pattern PR4 established.
  Verified live end-to-end: granted a group access to a project, confirmed
  it listed distinctly from user grants, revoked it — the first live proof
  of `resolveGrantRole`'s `viaGroup` join (built in PR1, unexercised until
  now).
- ✅ **PR4 — org switcher + Clerk-hosted invite UI.** No custom invite form
  or email-sending code — entirely Clerk's own hosted components, per
  PLAN.md §8's "we build only resource access." `<OrganizationSwitcher
  hidePersonal>` added to the sidebar footer (`hidePersonal` hides Clerk's
  native org-less "Personal account" context, which has no equivalent in
  this app's data model — every project always has a real `orgId`, via the
  auto-created personal org). The "Teams" nav stub is now live, pointing at
  a new `/teams` catch-all route mounting `<OrganizationProfile
  routing="path">` — invites, pending-invitation status, member roles, and
  removal are all handled by Clerk's own permission-aware UI (a non-admin
  member sees a read-only view with zero code on our side enforcing that).
  `lib/auth.ts`'s `getUserId` now threads through `orgId` — the org
  currently active in a Clerk session (set via the switcher's `setActive()`,
  no `organizationSyncOptions` middleware needed since this app doesn't do
  URL-synced org routing). `dashboard/page.tsx` and `api/projects/route.ts`
  GET/POST now prefer that active org over always defaulting to the
  personal one, using the exact `resolveRequestedOrgId` fallback chain
  PR1 built and left unused pending this PR. Every other route
  (`getAccessibleProject/Environment/Var`, groups, grants) is unaffected —
  those all resolve org from the target resource's own `orgId`, not from
  "what's active right now," so project URLs work regardless of switcher
  state. Verified live end-to-end across two real accounts: invited via
  `/teams`, accepted, switched active org, created a project under the
  newly-active org (confirmed via a real `POST /api/projects` → 201),
  added an env var, committed, and granted access via the PR2 Share dialog
  — the full stack composing correctly across PR1–PR4 in one live session.
- ✅ **PR5 — CLI `--org` support.** New `GET /api/orgs` (lists orgs the
  caller belongs to — reuses the same `getOrganizationMembershipList` call
  already made internally by `getClerkOrgRole`/`getOrCreatePersonalOrg`,
  just newly exposed for listing). CLI: `envhq orgs`, and a `--org <name>`
  flag on `projects`, `projects create`, `link`, and `init` — resolved via
  a new `resolveOrgId` helper (case-insensitive name match against
  `apiClient.listOrgs()`) and threaded into `listProjects(orgId?)` /
  `createProject(name, environments?, orgId?)`, both of which already
  accepted an `orgId` param server-side since PR1/PR4 with nothing feeding
  it from the CLI until now. Omitting `--org` is byte-for-byte the same
  behavior as before this PR (server defaults to the personal org) — purely
  additive, no regression for existing scripts/CI. Deliberately **not**
  stored in `.envhq/config.json`'s `LinkConfig` — every operational command
  (`push`/`pull`/`commit`/etc.) only needs the linked project/environment
  *id*, which already fully determines its org server-side; org selection
  only matters at discovery time. `apps/web` side verified via `tsc`/`lint`
  clean and the CLI build (`tsup`) succeeding; live cross-org verification
  against the deployed CLI is yours to run post-publish.
- ✅ **PR6 — `env_scope` enforcement (prod-protection).** `access_grants.envScope` (a JSON text
  blob, `{ [envName]: Role }`) goes from inert to enforced. `lib/access.ts`'s `resolveGrantRole`
  now takes an optional `envName` and caps each grant's role via `capRoleForEnv` (min of the
  grant's role and its scope's cap for that env, uncapped if the env has no entry) before the
  usual "highest of direct + group grants" reduction — so `getAccessibleEnvironment`/
  `getAccessibleVar` (which now pass the resolved environment's name) enforce it, while
  `getAccessibleProject` stays uncapped since project-level actions (rename, delete, manage
  access) aren't environment-scoped. Clerk org admin/owner bypass is unaffected — org admins stay
  full-access everywhere. `lib/grants.ts`'s `upsertGrant` gained an `envScope` param that's
  deliberately `undefined`-vs-`null` distinct: `undefined` leaves an existing grant's restriction
  untouched (so the Share dialog's plain role-change dropdown can't silently wipe a prod
  restriction), `null`/`{}` clears it. `api/projects/[id]/access/route.ts`'s `POST` validates a
  supplied `envScope` against the project's real environment names and rejects a cap ranked above
  the grant's own role (capping can't escalate); its `GET` now also returns the project's
  environment list so the Share dialog can build the per-env picker without a new endpoint.
  `share-dialog.tsx`: each grant row is now expandable into a per-environment cap selector
  (defaulting to "Full access ({role})"), with a shield icon marking rows that have any
  restriction set. This closes out M5 — role capping only for now (a cap restricts *how much*
  access an env gets, not remove it outright to zero; that's a natural follow-up, not required by
  PLAN.md §8's "e.g. read-only prod" framing).

**Done when:** an org admin can invite people, put them in groups, and grant
group/user access to specific projects with roles. — **Met.**

## M6 — Zero-knowledge encryption  🧊 ✅ (shipped, as staged PRs)

*Largest epic; own architecture pass. Reshaped web viewing, import, clone, and sharing.
Full design pass documented before implementation (envelope encryption, key hierarchy,
device-key mechanism, DEK granularity, metadata scope) — see PLAN.md §6 for the resolved
decisions.*

- ✅ **PR1 — crypto foundations + user key setup.** New `packages/crypto` (source-exported,
  mirrors `packages/parser`) — built on `@noble/hashes`/`@noble/ciphers`/`@noble/curves`, not
  libsodium: the published `libsodium-wrappers-sumo` ESM build turned out to be broken (a
  relative import to a file the npm package doesn't actually ship), and the non-sumo build's
  WASM doesn't include Argon2id despite listing its JS bindings — `@noble/*` sidesteps the whole
  WASM-loading/packaging problem. New `user_keys` table: one row per user, holding an X25519
  public key in the clear plus the private key wrapped two independent ways — under a
  passphrase-derived Argon2id Master Key (day-to-day unlock), and under a separately generated
  Recovery Key (the mandatory Recovery Kit, PLAN.md §6). Web: a new Settings → Security page
  (`security-manager.tsx`) walks through passphrase creation, recovery-phrase reveal, and a
  re-type confirmation before finishing setup (confirmation is enforced in the handler itself,
  not just via a disabled submit button — found live-testing that the design system's `Button`
  doesn't reliably forward native `disabled` semantics). `CryptoSessionProvider` holds the
  unwrapped private key in React state only — memory, never localStorage — for the browser
  session; a page refresh re-prompts.
- ✅ **PR2 — per-project DEK.** New `project_keys` table (one row per project × member holding a
  wrap). DEK granularity is per-**project**, not per-environment — confirmed by
  `env-store.ts`'s `cloneVars` and `version-store.ts`'s `restoreSnapshot`, which both copy
  `env_vars` ciphertext directly across environments/versions with no decrypt step, which only
  stays correct under one shared DEK. `POST /api/projects` client flow: generate a DEK, seal it
  to the creator's own public key, `POST /api/projects/[id]/keys` — best-effort at creation time
  (skipped if the creator's session isn't unlocked yet, healed later by PR6's self-heal fix
  below).
- **PR3 — migration — dropped.** All production data at the time M6 shipped was test data with
  nothing to preserve, so it was cleared outright rather than migrated — see PLAN.md §6 decision
  #8. This made the cutover to zero-knowledge unconditional: no legacy server-side ciphertext
  ever needed a decrypt-and-reencrypt pass, and `ENV_ENCRYPTION_KEY`/`lib/crypto.ts`'s old
  `encrypt`/`decrypt` became dead code the moment PR4 shipped.
- ✅ **PR4 — web value encryption.** `env_vars.auth_tag` made nullable (XChaCha20-Poly1305's tag
  lives in the ciphertext, unlike the AES-256-GCM scheme it replaced — no separate tag to
  store). `lib/env-store.ts` stopped calling `encrypt`/`decrypt` entirely — every function now
  takes/returns opaque `{ciphertext, iv}` blobs. `env-editor.tsx`'s reveal, add, edit,
  paste-import, and copy-all-as-`.env` all encrypt/decrypt client-side via a new
  `useProjectDek` hook. New gate states cover the cases where a DEK isn't available yet: `locked`
  (session not unlocked), `no-key` (authorized, but no wrap exists for you *yet* — a real
  pending-share case), and `uninitialized` (nobody holds a wrap at all, only reachable if the
  project is provably empty — self-heals via a "Generate encryption key" button, found and fixed
  from a real first-time-user report during live testing: a project created before its creator
  ever unlocked a session used to be permanently stuck, since reconciliation can only
  redistribute an *existing* DEK, not conjure one).
- ✅ **PR5 — CLI encryption.** `packages/cli` bundles `@envhq/crypto` via tsup (same pattern as
  `@envhq/parser`). New `envhq unlock`/`lock` commands; the unwrapped keypair is cached in the OS
  keychain via the existing `@napi-rs/keyring` dependency (`crypto-store.ts`, a new keychain
  service alongside the session-token one in `token-store.ts`) so `push`/`pull`/`diff` don't
  re-prompt every command. Passphrase entry uses a hand-rolled hidden-input prompt (raw-mode
  stdin, falls back to visible input over a non-TTY pipe). `exportEnv`/`commit` now carry
  ciphertext pairs; the three-way diff (`computeThreeWayDiff`) still runs on decrypted plaintext,
  just decrypted client-side first instead of being handed plaintext by the server.
- ✅ **PR6 — sharing.** Granting access wraps the DEK to the new member immediately
  (`access-manager.tsx`, right after the grant call succeeds) and via opportunistic
  reconciliation (`GET /api/projects/[id]/keys/pending` + `useProjectKeyReconciliation`, run on
  every env-editor/access-page visit by a client that already holds the DEK) for cases with no
  single "grant" moment, like a new group member. Revoking access — a direct grant, a group
  member removed, or a group deleted — deletes the corresponding `project_keys` row(s); the DEK
  itself isn't rotated, so a former member retains whatever they already fetched before removal
  (documented in `docs/security`, not silently glossed over). Verified live end-to-end with three
  real Clerk accounts against production — which also surfaced and fixed two more real bugs: a
  recovery-phrase confirmation that could be bypassed (see PR1), and personal orgs falling back
  to the literal name `"Personal"` for any account with no first/username set, making orgs
  indistinguishable in the project-creation org picker and causing confusing cross-account access
  (`getOrCreatePersonalOrg` now falls back through email first).

**Deferred, not built:** key-name/metadata encryption (only values are end-to-end encrypted);
DEK rotation on revoke; a full passphrase-rotation/"forgot passphrase" *reset* flow beyond the
already-shipped recovery-phrase *unlock* path; the keyed-HMAC (`valueTag`) conflict-detection
optimization from PLAN.md §6 (the `commit` route's 409 path works today, just decrypts more than
strictly necessary on a rare version race); WebAuthn/platform-bound "remember this device" for
the web; sender-constrained (DPoP) CLI tokens.

**Done when:** the server can no longer decrypt any secret, and sharing works by
re-wrapping keys to members. — **Met.**

---

## Dependency graph

```
M1 (auth) ✅ ──┐
M2 (lifecycle) ──┤ (independent, ship early)
M3 (sync) ✅──► M4 (versioning) ✅
M5 (teams) ✅──► M6 (zero-knowledge) ✅
```

## Suggested order

**M1 → M2 → M3 → M4 → M5 → M6.** All shipped. M6 landed last as planned — it
was the biggest commitment and benefited from M5's key model (grants already
existed and could be re-wrapped instead of designed from scratch).

M1–M6 are fully shipped. The CLI package is published on npm as `envhq`
(currently `0.8.0` at last publish, which already includes M6's client-side
encryption support). `packages/cli/package.json` is the source of truth for
the current published version.

**What's left** is the "Deferred, not built" list under M6 above — none of it
blocks normal use; see PLAN.md §6 and `docs/security` for the current,
user-facing framing of each gap.
