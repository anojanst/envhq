# env-sync

Store, organize, and sync environment variables. Group secrets by **project** and
**environment** (dev, qa, staging, uat, prod, and anything else), paste whole `.env`
files in bulk, copy them back out, and sync from your terminal with the CLI.

- **Web app** — Next.js (App Router) + Clerk auth + Neon Postgres + Drizzle + shadcn/ui
- **CLI** — `envsync` (Node/TS) for `push`/`pull` from any project folder
- **Encryption** — values are AES-256-GCM encrypted at rest; the DB never stores plaintext
- **Access** — personal-only (v1): every row is scoped to the signed-in user

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

Build it, then create a token in the web app under **CLI Tokens**.

```bash
pnpm --filter @env-sync/cli build

# point the CLI at your deployment (defaults to http://localhost:3000)
export ENVSYNC_URL=https://your-app.vercel.app

node packages/cli/dist/index.js login --token <token>
cd ~/code/my-project
envsync link                 # pick project + environment (writes .envsync.json)
envsync pull                 # write remote vars to ./.env
envsync push                 # upload ./.env to the remote (upsert/merge)
envsync status               # show login + link state
```

`envsync push`/`pull` accept `--env <name>` to target a different environment and
`--file <path>` to use a different file.

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
