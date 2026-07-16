# EnvHQ — System Design (as-built)

Canonical reference for the **currently implemented** system. Read this first in
new sessions to avoid re-deriving context. Future/planned work lives in
[PLAN.md](./PLAN.md) and [ROADMAP.md](./ROADMAP.md); this document describes only
what exists today.

> **Rebrand note:** this project was originally named **envsync** (domain
> `envsync.dev`, CLI package `@envsyncdev/cli`, command `envsync`, config dir
> `.envsync/`, env vars `ENVSYNC_*`, token prefix `envsync_`). It was rebranded
> to **EnvHQ** — domain `envhq.dev`, CLI package `envhq` (unscoped), command
> `envhq`, config dir `.envhq/`, env vars `ENVHQ_*`, token prefix `envhq_`. The
> CLI auto-migrates old `.envsync/` config and keychain entries on first run.
> This document describes the **current, post-rebrand** system only; historical
> milestone notes in [ROADMAP.md](./ROADMAP.md) may still reference the old name
> where they describe what was literally shipped at the time.

Last updated: v1 + UX pass (theme, brand, multiline editor, top-center toasts) + rebrand to EnvHQ.
**§5 (data model) and §6 (encryption) are current through M6** (zero-knowledge encryption,
2026-07-17). Other sections (§7 auth, §11 CLI, API reference) predate M2–M5 and haven't been
refreshed to match — cross-check against [ROADMAP.md](./ROADMAP.md)'s milestone notes for
anything not encryption-related.

---

## 1. Purpose

Store, organize, and sync environment variables. Secrets are grouped by
**project → environment → key/value**, encrypted at rest, editable in a web UI,
and pushable/pullable from a terminal via the `envhq` CLI. **The cloud is the
source of truth.** v1 is **personal-only** — every row is scoped to a Clerk user.

## 2. High-level architecture

```
        ┌──────────────┐         ┌──────────────┐
        │   Web UI      │        │   envhq CLI   │
        │ (browser)     │        │  (terminal)   │
        └──────┬───────┘         └──────┬───────┘
               │ Clerk session cookie    │ Bearer token
               ▼                          ▼
        ┌───────────────────────────────────────┐
        │   Next.js app (apps/web) on Vercel     │
        │   • React Server Components (read DB)   │
        │   • REST API routes (mutations, CLI)   │
        │   • getUserId(): session OR bearer      │
        │   • AES-256-GCM encrypt/decrypt         │
        └──────────────────┬────────────────────┘
                           │ Drizzle (neon-http)
                           ▼
                  ┌──────────────────┐
                  │  Neon Postgres    │  (ciphertext only)
                  └──────────────────┘

  Clerk (hosted)  → authentication / sessions / user identity
  Shared parser (packages/parser) → used by web AND cli
```

## 3. Tech stack (actual versions)

| Area | Choice |
|---|---|
| Runtime | Node.js ≥ 22.13 (dev on 22.22.3 via nvm) |
| Package manager | pnpm 11 (workspaces) |
| Web framework | Next.js **16.2.10** (App Router, Turbopack), React **19.2.4** |
| Auth | Clerk (`@clerk/nextjs` **7.5.14**) |
| DB | Neon Postgres via `@neondatabase/serverless` **1.1.0** |
| ORM | Drizzle **0.45.2** + drizzle-kit 0.31 |
| UI | Tailwind CSS v4, shadcn (**base-nova** style, built on `@base-ui/react`), lucide-react, next-themes 0.4.6 |
| CLI | TypeScript, commander **14**, bundled with tsup, run via tsx in dev |
| Hosting | Vercel (web), npm (`envhq`), domain `envhq.dev` |

## 4. Repository layout

```
envhq/                         (git repo root; pnpm workspace — the on-disk
│                                folder is still literally named env-sync/)
├── apps/web/                  @envhq/web — Next.js app (UI + API)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/         authenticated shell (header, nav)
│   │   │   │   ├── dashboard/            projects list + create
│   │   │   │   ├── projects/[id]/        envs list + create + editor
│   │   │   │   └── settings/tokens/      CLI token management
│   │   │   ├── api/           REST endpoints (see §8)
│   │   │   ├── sign-in|sign-up/          Clerk catch-all pages
│   │   │   ├── page.tsx       landing (branded)
│   │   │   ├── layout.tsx     ClerkProvider + ThemeProvider + Toaster
│   │   │   └── globals.css    design tokens (light+dark, emerald brand)
│   │   ├── components/
│   │   │   ├── ui/            shadcn components
│   │   │   ├── brand.tsx      Logo / BrandMark
│   │   │   ├── theme-provider.tsx, theme-toggle.tsx
│   │   ├── db/
│   │   │   ├── schema.ts      Drizzle schema (§5)
│   │   │   ├── index.ts       db client (neon-http)
│   │   │   └── migrations/    generated SQL
│   │   ├── lib/
│   │   │   ├── crypto.ts      AES-256-GCM + token hashing (§6)
│   │   │   ├── auth.ts        getUserId() — session OR bearer (§7)
│   │   │   ├── access.ts      ownership-scoped lookups
│   │   │   ├── env-store.ts   encrypt/decrypt boundary + upsert
│   │   │   ├── api.ts         JSON response helpers
│   │   │   ├── client.ts      browser fetch helper
│   │   │   └── utils.ts       cn()
│   │   └── middleware.ts      Clerk route protection
│   ├── drizzle.config.ts
│   └── .env.local            (gitignored) — secrets
├── packages/parser/          @envhq/parser — shared .env parse/serialize
├── packages/cli/             envhq — the `envhq` command
├── docs/                     PLAN.md, ROADMAP.md, SYSTEM_DESIGN.md
├── pnpm-workspace.yaml
└── .gitignore
```

## 5. Data model

Postgres, migrated incrementally (`apps/web/src/db/migrations/`). All timestamps are
`timestamptz` with `defaultNow()`. Schema source of truth: `apps/web/src/db/schema.ts`.

**`projects`** — owned by an org (M5), not a user directly.
| col | type | notes |
|---|---|---|
| id | uuid PK | `defaultRandom()` |
| user_id | text | Clerk userId of the creator; audit-only, not the auth scope |
| org_id | text | Clerk Organization id; **the actual auth scope** |
| name | text | **unique(org_id, name)** |
| created_at, updated_at | timestamptz | index on `org_id` |

**`personal_orgs`** — maps a Clerk userId to their auto-provisioned personal org (M5). One row
per user, `user_id` PK; `INSERT ... ON CONFLICT DO NOTHING` is the atomic get-or-create.

**`environments`** — under a project (dev/qa/staging/uat/prod/…, unlimited).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK → projects | `onDelete: cascade` |
| name | text | **unique(project_id, name)** |
| version | integer | server-owned linear version counter (M4), bumped via atomic CAS |
| created_at, updated_at | | index on `project_id` |

**`env_vars`** — a key/value pair; value zero-knowledge encrypted (M6).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| environment_id | uuid FK → environments | cascade |
| key | text | **unique(environment_id, key)** where `deleted_at is null` (soft-delete, M3) |
| value_ciphertext | text | base64 XChaCha20-Poly1305 ciphertext (tag included) |
| iv | text | base64 AEAD nonce (legacy column name, kept to avoid a rename migration) |
| auth_tag | text nullable | unused for new writes — XChaCha20-Poly1305's tag lives in `value_ciphertext`, unlike the AES-256-GCM scheme this column was named for pre-M6 |
| deleted_at | timestamptz nullable | soft-delete (M3) |
| created_at, updated_at | | index on `environment_id` |

**`environment_versions`** — a full immutable snapshot per commit (M4).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| environment_id | uuid FK → environments | cascade |
| version | integer | **unique(environment_id, version)** |
| message | text nullable | commit message |
| snapshot | jsonb | array of `{key, valueCiphertext, iv, authTag}` — ciphertext copied directly, never decrypted |
| created_by | text | Clerk userId |
| created_at | | index on `environment_id` |

**`user_keys`** — a user's zero-knowledge identity (M6). One row per user, `user_id` PK.
| col | type | notes |
|---|---|---|
| public_key | text | X25519 public key, base64, in the clear |
| kdf_salt, kdf_t, kdf_m, kdf_p | text/integer | Argon2id salt + cost params for this user's passphrase → Master Key derivation |
| wrapped_private_key, wrapped_private_key_nonce | text | private key wrapped under the passphrase-derived Master Key |
| wrapped_private_key_by_recovery, wrapped_private_key_by_recovery_nonce | text | the same private key, wrapped a second, independent way under the Recovery Key |

**`project_keys`** — a project's Data Encryption Key, wrapped per member (M6).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK → projects | cascade |
| subject_user_id | text | who this wrap is for |
| wrapped_dek | text | the DEK, sealed (`crypto_box_seal`-equivalent) to `subject_user_id`'s public key |
| wrapped_by_user_id | text | who performed the wrap (audit) |
| | | **unique(project_id, subject_user_id)**, index on `project_id` |

**`access_grants`** — project-level role grant to a user or group (M5).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id, project_id | | project's org (denormalized) + the project |
| subject_type | text | `"user"` \| `"group"` |
| subject_id | text | Clerk userId or `groups.id` |
| role | text | `"viewer"` \| `"editor"` \| `"admin"` |
| env_scope | text nullable | JSON `{envName: role}` — per-environment role cap |
| | | **unique(project_id, subject_type, subject_id)** |

**`groups`** / **`group_members`** — org-scoped named sets of users (M5), for granting several
people access at once via `access_grants.subject_type = "group"`.

**`api_tokens`** — personal access tokens for CLI auth.
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | text | |
| name | text | user-facing label |
| token_hash | text unique | SHA-256 of the token (plaintext never stored) |
| kind | text | `"pat"` (user-created) or `"cli_session"` (browser-login, M1) |
| project_id, capability | uuid nullable / text | PAT scoping (M1) — null project = all projects |
| expires_at, last_used_at | timestamptz nullable | |
| created_at | | index on `user_id` |

**`cli_auth_requests`** — short-lived PKCE codes backing the CLI browser-login flow (M1).

## 6. Encryption — zero-knowledge, end-to-end (M6)

The server **never holds a key capable of decrypting a value**. All encryption/decryption of
env-var values happens client-side — in the browser (`apps/web`) or in the CLI process
(`packages/cli`) — using the shared, source-exported `packages/crypto` package (mirrors
`packages/parser`'s pattern; built on `@noble/hashes`/`@noble/ciphers`/`@noble/curves`, not
libsodium — see that package's top-of-file comment for why).

**Key hierarchy:**
1. Passphrase → **Argon2id** (`deriveMasterKey`) → 32-byte **Master Key**. Cost params
   (`t`/`m`/`p`) are persisted per-user in `user_keys` so re-deriving later uses the same work
   factor. Defaults to OWASP's minimum baseline (19 MiB / 2 passes) — tuned for ~1s in a browser,
   since this runs on every unlock.
2. Master Key unwraps (`unwrapPrivateKey`, XChaCha20-Poly1305) a **User Keypair** (X25519),
   generated once at ZK onboarding (`Settings → Security`). A separately generated **Recovery
   Key** wraps the same private key a second, independent way — the mandatory Recovery Kit;
   losing both the passphrase and the recovery phrase means permanently losing access (no
   server-side reset is possible, by design).
3. Each **project** has a random 32-byte **DEK** (`generateDek`), generated at project creation.
   The DEK is sealed (`sealToPublicKey`, an X25519-ECDH + HKDF construction analogous to
   libsodium's `crypto_box_seal`) to the public key of every member with access, one
   `project_keys` row per (project, member) pair — never per environment: `env-store.ts`'s
   `cloneVars` and `version-store.ts`'s `restoreSnapshot` both copy `env_vars` ciphertext
   directly across environments/versions with no decrypt step, which only stays correct if
   every environment in a project shares one DEK.
4. Values are encrypted under the project DEK with **XChaCha20-Poly1305** (`encryptValue`/
   `decryptValue`) — the AEAD tag is embedded in the ciphertext, unlike the AES-256-GCM scheme
   this replaced, so `env_vars.auth_tag` is unused for new writes.

**Authorization ≠ decryption capability.** `lib/access.ts`'s Clerk-org-admin bypass (and a
newly-granted group member) can be *authorized* for a project with no `project_keys` row yet.
`useProjectDek` (`apps/web/src/hooks/use-project-dek.ts`) surfaces this as a distinct `no-key`
state (vs. `uninitialized` — nobody holds the DEK at all, only reachable if the project is
provably empty, self-healed via a "Generate encryption key" action) so the UI doesn't silently
fail. Delivery is two-pronged: granting access wraps the DEK for the new member immediately
(`access-manager.tsx`, right after the grant succeeds), and `GET /api/projects/[id]/keys/pending`
+ `useProjectKeyReconciliation` opportunistically wrap it for anyone still missing one, on every
env-editor/access-page visit by a client that already holds it. Revoking access deletes the
corresponding `project_keys` row(s) — but does not rotate the DEK, so a former member retains
whatever they already fetched before removal (see `docs/security` for the user-facing framing).

**Not encrypted:** key *names* (project/environment/variable) — only values. The three-way
sync/diff protocol (`push`/`pull`) operates on key names server-side by design.

**Tokens** (unrelated to value encryption, still server-side, `lib/crypto.ts`):
`generateToken()` → `envhq_` + 24 random bytes base64url; `hashToken()` → SHA-256 hex (only the
hash is ever stored).

## 7. Auth & authorization

- **Clerk** provides identity/sessions. `middleware.ts` uses `clerkMiddleware` +
  `createRouteMatcher`; public routes: `/`, `/sign-in*`, `/sign-up*`. API routes
  authenticate themselves (middleware runs but never force-redirects them).
- **The pluggable seam — `lib/auth.ts::getUserId(req)`** resolves the acting user
  from **either**:
  1. `Authorization: Bearer <token>` → SHA-256 lookup in `api_tokens` (CLI path),
     updates `last_used_at`.
  2. Clerk session cookie → `auth()` (web path).
  Returns Clerk `userId` or null. This one function is why web + CLI share the
  same API.
- **Authorization** is ownership-scoped in `lib/access.ts`
  (`getOwnedProject/Environment/Var`) — every query filters up to
  `projects.user_id = <caller>`; missing/foreign rows are treated as 404.
- API route handlers set `export const runtime = "nodejs"` (crypto + neon-http).

## 8. API reference

All under `/api`, JSON, authenticated via `getUserId`. `401` if unauth, `404` if
not owned, `400` bad input, `409` conflict.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/me` | whoami (validates token) |
| GET | `/api/projects` | list caller's projects |
| POST | `/api/projects` | create `{name, environments?}` — **defaults to a `dev` env**; returns `{project, environments}` |
| GET | `/api/projects/[id]` | project + its environments |
| PATCH | `/api/projects/[id]` | rename |
| DELETE | `/api/projects/[id]` | delete (cascades) |
| POST | `/api/projects/[id]/environments` | create env `{name}` (409 on dup) |
| GET | `/api/environments/[id]` | env + project + decrypted vars (with ids) |
| PATCH | `/api/environments/[id]` | rename env |
| DELETE | `/api/environments/[id]` | delete env |
| POST | `/api/environments/[id]/vars` | upsert one `{key, value}` |
| POST | `/api/environments/[id]/import` | paste-a-blob: parse + **upsert-merge**; returns `{created, updated, total}` |
| GET | `/api/environments/[id]/export` | serialize to `.env` blob `{content, count}` |
| PATCH | `/api/vars/[id]` | update key and/or value |
| DELETE | `/api/vars/[id]` | delete one var |
| GET | `/api/tokens` | list tokens (metadata only) |
| POST | `/api/tokens` | create `{name}` → returns plaintext **once** |
| DELETE | `/api/tokens/[id]` | revoke |

## 9. Web app

- **Rendering pattern:** pages are **React Server Components** that read the DB
  directly via `auth()` + `access.ts` helpers. Mutations happen in **client
  components** that call the REST API with `lib/client.ts` (same-origin, session
  cookie sent automatically), then `router.refresh()`.
- **Routes:** landing `/`; `(app)` group (header + `UserButton` + theme toggle +
  CLI-tokens link) wraps `/dashboard`, `/projects/[id]`,
  `/projects/[id]/environments/[envId]` (the editor), `/settings/tokens`.
- **Env editor** (`env-editor.tsx`): masked table with reveal toggle, per-row
  copy, copy-all-as-`.env`, paste-`.env` dialog (upsert), add/edit/delete;
  values are **auto-growing multiline textareas**, revealed values wrap.
- **Theming:** `next-themes`, class strategy, **default light**, toggle in header.
  Design tokens in `globals.css` (neutral base + **emerald brand** `--brand`),
  light + dark. shadcn base-nova uses `@base-ui/react` — **`render={<Component/>}`
  prop, not `asChild`**.
- **Brand:** `components/brand.tsx` — `Logo` (sync glyph mark + `env`**`sync`**
  wordmark). Toasts (sonner) are **top-center**.

## 10. Shared parser (`packages/parser`)

Pure TypeScript, no deps, source-exported (`transpilePackages` in web; bundled
into the CLI by tsup). Runs on server and client.

- `parseEnv(text) → EnvPair[]` — handles `KEY=value`, `export KEY=`, `#` comments
  (full-line + inline after whitespace), single/double quotes, escapes in double
  quotes, **multi-line quoted values** (PEM keys), `=` inside values; duplicate
  keys → last wins, first position kept.
- `serializeEnv(pairs) → string` — quotes/escapes only when needed; round-trips.
- `pairsToRecord` / `recordToPairs` helpers. Tested (`src/index.test.ts`,
  `node --test`).

## 11. CLI (`packages/cli`, published `envhq`, command `envhq`)

> This section predates the M1 (CLI auth hardening) and M2 (CLI-first
> lifecycle) milestones described in [ROADMAP.md](./ROADMAP.md) — those shipped
> browser login, OS-keychain tokens, scoped PATs, `init`/`projects create`,
> multi-env link, and `env create --from`, which aren't fully reflected below
> yet. Branding here is current; command/feature coverage should be refreshed
> against ROADMAP.md M1/M2 separately.

- **Commands:** `login --token <t> [--url]`, `logout`, `whoami`, `projects`,
  `link [--project]`, `env map <env> <file>`, `pull [env --file --all --force
  --yes]`, `push [env --file --all --yes]`, `status`. Positional `[env]`
  defaults to the link's default environment; `--file` overrides the linked
  mapping for one run; `--all` acts on every linked environment (mutually
  exclusive with an explicit env or `--file`); `prod`/`production` envs prompt
  for confirmation unless `--yes`.
- **Config files:**
  - `~/.envhq/config.json` — `{ url }` (global auth url; token lives in the
    OS keychain, see PLAN §7).
  - `./.envhq/config.json` — per-folder link `{ projectId, projectName,
    environments: { name → { id, file } }, default }` (gitignored). Older
    `./.envsync/config.json` or the pre-M2 single-env `./.envsync.json` are
    auto-migrated on first read (and any keychain session under the old
    "envsync" service name is migrated too).
- **URL resolution:** `ENVHQ_URL` → **URL baked at build** (tsup `define`
  `__ENVHQ_DEFAULT_URL__`, default `https://envhq.dev`) → localhost. Dev runs
  (tsx) fall back to localhost.
- **API client** (`src/api.ts`) sends `Authorization: Bearer <token>`; distinct
  messages for 401 / network errors.
- **Publishing:** `pnpm build` (bakes prod URL) then `pnpm publish --access public
  --no-git-checks`. Parser is bundled, so the package is self-contained. `bin`
  name is `envhq` regardless of package name.


## 12. Deployment & environment variables

- **Web:** Vercel, root directory `apps/web`. Domain **`envhq.dev`** — should be
  set as the **apex-primary** custom domain (`www` redirecting to apex, not the
  reverse) so the CLI's bearer header survives with no cross-origin redirect on
  `/api/*` (this was verified for the old `envsync.dev` domain; re-verify after
  pointing DNS at `envhq.dev`).
- **Required env vars** (Vercel + `apps/web/.env.local` locally):
  `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `ENV_ENCRYPTION_KEY` (32-byte base64), and Clerk routing vars
  (`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `…SIGN_UP_URL=/sign-up`,
  `…SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard`, `…SIGN_UP_FALLBACK…=/dashboard`).
- Migrations run with prod `DATABASE_URL`: `pnpm --filter @envhq/web db:migrate`.

## 13. Local dev & tooling

- **Node 22 via nvm** — the environment's default shell may resolve Node 18; use
  `nvm use 22` / set `nvm alias default 22`. (pnpm ≥ its version needs Node
  ≥ 22.13. Older bundled corepack has a pnpm-key-signature bug — update corepack.)
- **Commands (from root):** `pnpm dev` (web on :3000), `pnpm build`,
  `pnpm db:generate` / `pnpm db:migrate`, `pnpm --filter envhq build`.
- Drizzle config loads `.env.local` via dotenv (drizzle-kit runs outside Next).
- Native builds (`sharp`, `unrs-resolver`, `esbuild`) are approved in
  `pnpm-workspace.yaml` (`onlyBuiltDependencies` / `allowBuilds`).

## 14. Conventions & invariants

- **Everything scoped by `user_id`** — no cross-user access (v1 personal-only).
- **Encrypt/decrypt only in the API/server layer** (`env-store.ts`,
  `crypto.ts`); the DB never holds plaintext; the CLI/web get plaintext over
  HTTPS.
- **Env values can be multi-line** (PEM keys) — parser, editor, and storage all
  support it.
- **The API is the shared contract**; both web and CLI are clients. Don't add
  server-action-only mutations the CLI can't reach.
- shadcn base-nova → **`render` prop, not `asChild`**.

## 15. Not yet built (pointers)

M1 through M6 have all shipped (deletion-aware three-way sync, versioning, CLI browser login,
teams/orgs with per-env role caps, zero-knowledge encryption — see [ROADMAP.md](./ROADMAP.md)).
What's left, per M6 PR6's own "explicitly deferred" list:

- Key-name/metadata encryption (only values are end-to-end encrypted today).
- DEK rotation on revoke (a revoked member keeps whatever they already fetched).
- Passphrase rotation / a full "forgot passphrase" reset flow beyond the already-shipped
  recovery-phrase *unlock* path (`unlockWithRecoveryPhrase`) — there's no UI yet to unwrap via
  recovery and then set a *new* passphrase.
- The keyed-HMAC (`valueTag`) conflict-detection optimization from PLAN.md §6 — the `commit`
  route's 409 path works today (returns ciphertext, the caller decrypts to diff), just does more
  decryption than strictly necessary on a rare version race.
- WebAuthn/platform-bound "remember this device" for the web (currently memory-only per session).
- Sender-constrained (DPoP) CLI tokens (PLAN.md §7's noted future tier).

See [PLAN.md](./PLAN.md) + [ROADMAP.md](./ROADMAP.md).

## 16. Key file index

| Concern | File |
|---|---|
| DB schema | `apps/web/src/db/schema.ts` |
| DB client | `apps/web/src/db/index.ts` |
| Encryption | `apps/web/src/lib/crypto.ts` |
| Auth seam | `apps/web/src/lib/auth.ts` |
| Ownership checks | `apps/web/src/lib/access.ts` |
| Encrypt boundary / upsert | `apps/web/src/lib/env-store.ts` |
| Route protection | `apps/web/src/middleware.ts` |
| API routes | `apps/web/src/app/api/**/route.ts` |
| Env editor UI | `apps/web/src/app/(app)/projects/[id]/environments/[envId]/env-editor.tsx` |
| Design tokens | `apps/web/src/app/globals.css` |
| Shared parser | `packages/parser/src/index.ts` |
| CLI entry | `packages/cli/src/index.ts` |
| CLI config/URL | `packages/cli/src/config.ts` |
