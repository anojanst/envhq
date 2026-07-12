# env-sync

Store, organize, and sync environment variables. Group secrets by **project** and
**environment** (dev, qa, staging, uat, prod, and anything else), paste whole `.env`
files in bulk, copy them back out, and sync from your terminal with the CLI.

- **Web app** — Next.js (App Router) + Clerk auth + Neon Postgres + Drizzle + shadcn/ui
- **CLI** — `envsync` (Node/TS) for `push`/`pull` from any project folder
- **Encryption** — values are AES-256-GCM encrypted at rest; the DB never stores plaintext
- **Access** — personal-only (v1): every row is scoped to the signed-in user

## Documentation

Full design and reference docs live in [`docs/`](./docs):

- [**System Design**](./docs/SYSTEM_DESIGN.md) — as-built architecture, data model, API, CLI (start here)
- [**Plan**](./docs/PLAN.md) — design spec for decided-but-unbuilt features
- [**Roadmap**](./docs/ROADMAP.md) — phased milestones (M1–M6)

## Monorepo layout

```
apps/web            Next.js app (UI + REST API)
packages/parser     Shared .env parser/serializer (used by web + CLI)
packages/cli        The `envsync` command-line tool
```

## Prerequisites

- Node.js **≥ 22.13** (Node 22 LTS recommended)
- pnpm (via `corepack enable`)
- A [Neon](https://neon.tech) database and a [Clerk](https://clerk.com) application

## Setup

```bash
pnpm install

# Configure env vars
cp apps/web/.env.example apps/web/.env.local
# then fill in DATABASE_URL, Clerk keys, and generate ENV_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Create the database tables
pnpm db:migrate

# Run the app
pnpm dev            # http://localhost:3000
```

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Set the **Root Directory** to `apps/web`.
3. Add environment variables (from `.env.example`): `DATABASE_URL`,
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ENV_ENCRYPTION_KEY`,
   and the Clerk routing vars.
4. Deploy. Run `pnpm db:migrate` against the production `DATABASE_URL` once
   (locally with the prod URL, or via a one-off job).

> Keep `ENV_ENCRYPTION_KEY` stable — rotating it makes existing encrypted values
> undecryptable. Back it up somewhere safe.

## Using the CLI

Once published, users install it from npm and never need to know a URL — the
deployment URL is baked into the build:

```bash
npm install -g @envsyncdev/cli    # installs the `envsync` command
# or run without installing: npx @envsyncdev/cli <command>

envsync login --token <token> # token from the web app → CLI Tokens
cd ~/code/my-project
envsync link                  # pick a project, map every environment to a file
envsync pull                  # write the default environment to its mapped file
envsync push                  # upload the default environment from its mapped file
envsync status                # show login + link state (and target URL)
```

`envsync push`/`pull` accept a positional `[env]` to target a different
environment, `--file <path>` to use a different file, and `--all` to act on
every linked environment at once. Override the server with `--url <url>` on
`login` or the `ENVSYNC_URL` env var (for local dev or self-hosting).

### Publishing the CLI

Release builds bake in the production URL (`https://envsync.dev`) by default,
so publishing is just:

```bash
cd packages/cli
pnpm build
npm login                              # one-time
pnpm publish --access public --no-git-checks
```

Use `pnpm publish` (not `npm publish`) so the bundled `@env-sync/parser`
workspace reference is rewritten correctly. Published as `@envsyncdev/cli`;
the installed command is still `envsync`.

The `@env-sync/parser` package is bundled into the CLI, so the published package
is self-contained (no workspace dependency to resolve).

To test the built artifact against a **local** server, build with an override
(or just use `pnpm dev`, which always targets localhost):

```bash
ENVSYNC_DEFAULT_URL=http://localhost:3000 pnpm build
# or override at runtime: ENVSYNC_URL=http://localhost:3000 envsync status
```

## Data model

- `projects` — owned by a Clerk `userId`
- `environments` — belong to a project; unlimited; unique name per project
- `env_vars` — key + AES-256-GCM (`ciphertext`, `iv`, `authTag`); unique key per environment
- `api_tokens` — SHA-256 hashes of personal tokens for CLI auth

## Roadmap (post-v1)

- Team/shared projects with roles
- Change history / versioning
- Browser-based `envsync login` (device flow) instead of paste-a-token
- `envsync run -- <cmd>` to inject vars without writing them to disk
