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

## M1 — CLI auth hardening  🔜

*Self-contained, security-critical, no dependencies. Good first milestone.*

- Browser loopback login + PKCE code exchange (PLAN §7)
- 7-day expiring tokens (`expires_at`, `token_expired`, auto-relogin)
- Token storage: OS keychain / `ENVSYNC_TOKEN` only — no plaintext file
- `/cli/authorize` approve page; `cli_auth_requests` table
- **Scoped + expiring PATs** for CI (PLAN §6 near-term)

**Done when:** a new user runs `envsync login`, approves in the browser, and
`push`/`pull` work for 7 days then transparently re-auth; no token ever on disk.

## M2 — CLI-first project & env lifecycle  ⏳

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
M1 (auth) ──┐
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
