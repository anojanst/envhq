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

Postgres, one migration (`0000_natural_piledriver.sql`). All timestamps are
`timestamptz` with `defaultNow()`.

**`projects`** — owned by a Clerk user.
| col | type | notes |
|---|---|---|
| id | uuid PK | `defaultRandom()` |
| user_id | text | Clerk userId; **everything scoped by this** |
| name | text | |
| created_at, updated_at | timestamptz | |
| | | index on `user_id` |

**`environments`** — under a project (dev/qa/staging/uat/prod/…, unlimited).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK → projects | `onDelete: cascade` |
| name | text | **unique(project_id, name)** |
| created_at, updated_at | | index on `project_id` |

**`env_vars`** — a key/value pair; value encrypted at rest.
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| environment_id | uuid FK → environments | cascade |
| key | text | **unique(environment_id, key)** |
| value_ciphertext | text | base64 AES-256-GCM ciphertext |
| iv | text | base64, per-value 96-bit nonce |
| auth_tag | text | base64 GCM tag |
| created_at, updated_at | | index on `environment_id` |

**`api_tokens`** — personal access tokens for CLI auth.
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | text | |
| name | text | user-facing label |
| token_hash | text unique | SHA-256 of the token (plaintext never stored) |
| last_used_at | timestamptz nullable | |
| created_at | | index on `user_id` |

## 6. Encryption (`lib/crypto.ts`)

- **AES-256-GCM**, 96-bit random IV per value, GCM auth tag. Server-side only
  (Node runtime).
- Master key from **`ENV_ENCRYPTION_KEY`** (32 bytes, base64). Must stay stable —
  rotating it makes existing values undecryptable.
- `encrypt(plaintext) → {ciphertext, iv, authTag}` (all base64); `decrypt(...)`.
- Tokens: `generateToken()` → `envhq_` + 24 random bytes base64url;
  `hashToken()` → SHA-256 hex (only the hash is stored).
- **This is server-side encryption, not zero-knowledge** — the server can
  decrypt. (ZK is planned; see PLAN §6.)

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

Deletion-aware three-way sync, versioning, CLI browser login / expiring tokens,
teams/orgs, zero-knowledge encryption, `env create`/`init`/multi-env link,
per-env scoping. See [PLAN.md](./PLAN.md) + [ROADMAP.md](./ROADMAP.md).

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
