# Changelog

All notable changes to the `envhq` CLI (and, where relevant, the server
functionality it depends on) are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/) — see
[docs/RELEASE_POLICY.md](./docs/RELEASE_POLICY.md) for the reasoning.

> **Going forward, this file covers only the pre-Changesets history above.**
> Every release from `0.9.0` onward is versioned by
> [Changesets](https://github.com/changesets/changesets), which writes its
> own machine-generated `packages/cli/CHANGELOG.md` on every version bump —
> that file is the authoritative, per-release changelog from here on. This
> root file stops growing new version entries; it exists to preserve the
> hand-written narrative history that predates the tooling.

> **A note on precision for everything below `0.9.0`.** This history is
> backfilled from git log and npm's publish timestamps, not from
> contemporaneous release notes — none existed before this changelog. Two
> things make an exact commit-to-version mapping impossible to reconstruct:
> the project shipped its first two milestones under a **different package
> name** (`@envsyncdev/cli`, pre-rebrand — see the note in
> [docs/ROADMAP.md](./docs/ROADMAP.md)), and `envhq`'s own early versions
> bundled multiple milestones' worth of work into single releases (M3 and M4
> "landed together", per ROADMAP.md). Entries below are grounded in
> ROADMAP.md's own milestone descriptions and cross-referenced against real
> npm publish dates, not fabricated with false precision. From `0.9.0`
> onward, entries reflect what actually shipped in that release.

## [Unreleased]

- Authorization test suite: the access matrix in `apps/web/src/lib/access.ts`
  is now encoded as a language-neutral fixture corpus and run table-driven
  in CI, with a real Postgres service container (HQ-19).
- `apps/web` now has a Vitest test runner (HQ-18).
- CI: GitHub Actions workflow for lint/test/build across the JS workspaces.
- Licensing: split license landed — Elastic License 2.0 for `apps/**`, MIT
  for `packages/cli`, `packages/parser`, `packages/crypto` (HQ-15, ADR-007).
- Contributor License Agreement (ICLA/CCLA) and CLA Assistant Lite enforcement
  on pull requests, repo-wide (HQ-16, ADR-017).
- `apps/web`'s database driver switched from `@neondatabase/serverless`
  (Neon-specific, HTTP-only) to `postgres`/`drizzle-orm/postgres-js` (a
  standard Postgres wire-protocol driver), so the app can be deployed to
  Azure Database for PostgreSQL and AWS RDS/Aurora, not only Neon (HQ-21,
  ADR-015). Adds `DATABASE_CA_CERT` support for custom root CAs.
- Release tooling: Changesets, a documented release policy, and a tagging
  convention distinguishing CLI package releases from whole-product
  enterprise release tags (HQ-20, ADR-011).

## [0.9.0] — 2026-08-11

- **DEK rotation on revoke.** Closes a gap M6 explicitly deferred: revoking
  a member's project access removed their key wrap, but the project's data
  encryption key itself never changed, so a former member's already-fetched
  copy could still decrypt current values. Rotation is now two-phase and
  entirely client-driven (server never sees a usable key): `migrate`
  re-encrypts every variable under a fresh DEK in resumable batches, then
  `finalize` — gated on migration being complete and the caller's wrap set
  matching current real membership — swaps every member's wrap in one step.
  Surfaced as an admin-only "Encryption" section on the project access page.

## [0.8.0] and [0.7.0] — 2026-07-12 / 2026-07-13

- **M5 — Teams & access control**, shipped as six staged PRs: an org-owned
  data model with a Clerk-organization-backed personal org per user;
  direct user grants with role-based access; groups (CRUD, then wired into
  project sharing); an org switcher plus Clerk-hosted invite UI; CLI
  `--org` support; and `env_scope` enforcement so a grant can be capped to
  a lower role in a specific environment (e.g. read-only in `prod`).
- **M6 — Zero-knowledge encryption**, shipped as staged PRs: client-side
  X25519 user keypairs (`@noble/*`, not libsodium — the published
  libsodium WASM build had packaging issues) wrapped under a
  passphrase-derived Argon2id key and a separate recovery key; a
  per-project data encryption key (DEK), sealed per member; the server
  stops ever seeing plaintext values (`env_vars` holds only opaque
  ciphertext); CLI `unlock`/`lock` commands with OS-keychain caching; and
  DEK re-wrapping on every grant, plus opportunistic reconciliation for
  cases with no single "grant" moment (e.g. a new group member).
- These two milestones are the largest changes ever shipped to the project;
  see [docs/ROADMAP.md](./docs/ROADMAP.md)'s M5/M6 sections for the full,
  PR-by-PR account — condensed here for changelog brevity.

## [0.6.0], [0.5.0], and [0.4.0] — 2026-07-12

- **Rebrand**: `envsync`/`envsync.dev`/`@envsyncdev/cli` became
  `EnvHQ`/`envhq.dev`/`envhq` — this is the point where the npm package
  now published as `envhq` begins; see the "shipped under a different
  name" note at the top of this file.
- **M3 — Sync engine**: environment-keyed local base state, three-way
  `push` diffing (local vs. base vs. live remote), soft-delete with a
  partial unique index so a deleted key's name can be reused, and
  `envhq diff`/`status` previews.
- **M4 — Versioning ("git for env")**: per-environment integer version +
  optimistic concurrency (`commitVersion`'s atomic
  `UPDATE ... WHERE version = $baseVersion`), full snapshots per version,
  `history`/`diff`/`rollback`, and server-side key-level conflict
  reporting on a stale push. M3 and M4 landed together as one body of work
  (see `docs/ROADMAP.md`).

## Pre-rebrand history (shipped as `@envsyncdev/cli`, not on the `envhq` npm history)

- **`@envsyncdev/cli@0.2.1`** — **M1: CLI auth hardening.** Browser
  loopback login + PKCE, 7-day expiring tokens with transparent re-auth,
  OS-keychain token storage (no plaintext on disk), and scoped/expiring
  Personal Access Tokens for CI.
- **M2: CLI-first project & environment lifecycle** (version not
  independently recorded) — unique project names, multi-environment
  workspace linking, `envsync init`/`projects create`, and environment
  cloning.
- **Phase 0 — v1 + polish** — the original monorepo, web app, CLI, and
  shared parser; projects/environments/env_vars with server-side
  encryption (later superseded by M6's zero-knowledge model); the initial
  CLI command set (`login`/`link`/`push`/`pull`/`status`).

See [docs/ROADMAP.md](./docs/ROADMAP.md) for the complete, authoritative
milestone history this changelog summarizes.
