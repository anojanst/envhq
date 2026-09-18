# EnvHQ — Release Policy

EnvHQ is a hosted service with one published client. That makes releases two
separate things, and this document is the operational reference for both:

- **The app** (`apps/web`) — deployed by Vercel from `main`. There is no version
  number, no tag, and no release ceremony: what is on `main` is what is running.
- **The CLI** (`packages/cli`, published as `envhq`) — a real npm package with
  real consumers, versioned by [Changesets](https://github.com/changesets/changesets).

## Versioning: semantic versioning, not CalVer

The CLI uses [semver](https://semver.org/). The deciding factor is who reads the
version string: someone with `envhq` in a `package.json` or a CI image, whose
question is always **"will upgrading break my pipeline?"** Semver encodes that in
the major component; CalVer only communicates recency, which isn't the question
being asked.

## Tagging convention

One tag namespace:

| Tag format | What it marks | Cut by |
|---|---|---|
| `envhq@X.Y.Z` | A published release of the `envhq` CLI package to npm. | Changesets, automatically, via [`release.yml`](../.github/workflows/release.yml) when a "Version Packages" PR merges to `main`. |

`@envhq/web`, `@envhq/crypto`, and `@envhq/parser` are versioned and changelogged
by Changesets (crypto/parser genuinely, web is excluded — see
[`.changeset/README.md`](../.changeset/README.md)) but never published to npm, so
they don't get a tag namespace of their own.

## Cutting a CLI release

1. Open PRs with a `pnpm changeset` entry describing the change.
2. On merge to `main`, [`release.yml`](../.github/workflows/release.yml)
   opens or updates a "Version Packages" PR.
3. Merging that PR runs the actual `npm publish` and pushes the `envhq@X.Y.Z` tag.

Release builds bake in the production URL (`https://envhq.dev`) — see the CLI
section of [`../README.md`](../README.md) for building against a local server
instead.

## Deploying the app

Vercel builds and deploys `apps/web` from `main`; a merged PR is a deploy. CI
([`ci.yml`](../.github/workflows/ci.yml)) is the gate in front of that — lint,
tests against a real Postgres, and a build must pass before a PR can merge.

Schema changes are not part of the Vercel build. Run migrations against the
production database explicitly:

```bash
pnpm --filter @envhq/web db:migrate    # with the production DATABASE_URL
```

## Migration constraints

There is one production database and it migrates forward continuously, with no
down path and no maintenance window. Every migration under
[`apps/web/src/db/migrations/`](../apps/web/src/db/migrations/) must therefore be:

- **Pure SQL** — no application-code dependency.
- **Forward-only** — no down-migrations to maintain or trust.
- **Idempotent** — safe to apply to a database that may already be partway
  migrated.
- **Never dependent on application code having run first.** A migration that
  needs a backfill script to execute before it is correct breaks silently: the
  schema change applies, the data it assumed is absent, and nothing reports an
  error until something reads the wrong rows.

A destructive schema change also has to survive the window where old and new code
are both serving traffic — a deploy is not instant, and a rollback puts the old
code back. Use expand/contract: expand and dual-write, backfill, switch reads,
then drop the old shape in a later deploy. Track the "drop" half somewhere
durable; it lands well after the work that motivated it and is easy to forget.
