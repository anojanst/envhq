# env-sync — Roadmap

Phased sequencing of the work in [PLAN.md](./PLAN.md). Ordered to ship
self-contained, high-value pieces first, defer the heavy epics, and respect
dependencies. Milestones are independent unless a dependency is noted.

Legend: ✅ done · 🔜 next · ⏳ planned · 🧊 epic (own architecture pass)

---

## Phase 0 — v1 + polish  ✅ (shipped)

- ✅ Monorepo, web app, CLI, shared parser
- ✅ Projects / environments / env_vars, server-side encryption
- ✅ CLI `login`/`link`/`push`/`pull`/`status`, deployed at `envsync.dev`
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

## M2 — CLI-first project & env lifecycle  🔜

*Self-contained; unlocks the CLI-first workflow. Depends on M1 for auth UX only.*

- `envsync init` + `projects create` (PLAN §2); unique project names + migration
- `env create --from` clone, `env list`, no auto-link / `--link` (PLAN §4)
- Multi-env workspace link (`push <env>`, env→file mapping, `--all`, prod guard)
- Web project-create `409` handling for parity

**Done when:** you can `envsync init` a fresh folder and manage multiple
environments + files entirely from the terminal.

## M3 — Sync engine: cloud as source of truth  ⏳

*The correctness core. Foundation for M4.*

- Env-keyed base (key names + version) in `.envsync/` (PLAN §1)
- Three-way `push` (add / update / soft-delete); `pull` refreshes base
- **Non-clobbering pull** (back up / refuse / diff) — required before M4
- Soft-delete (`deleted_at`) + partial unique index + restore + trash
- `envsync diff` / `status`; deletion + sensitive-env confirmations

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

**Next up: M2** (see above for scope). M1 is fully shipped and published
(`@envsyncdev/cli@0.2.1`) — a fresh agent picking up M2 only needs this doc's
M1 approach summary for context, not the original M1 conversation.
