# EnvHQ — Release Policy

Implements the decisions in **ADR-011** (release engineering — CI as a gate,
semver, 12-month support, SaaS soak before enterprise tags). See the ADR for
the full reasoning and rejected alternatives; this document is the
operational reference kept up to date as releases actually happen.

## Versioning: semantic versioning, not CalVer

Releases use [semver](https://semver.org/). The deciding factor is who reads
the version string: an enterprise customer pins a release and plans upgrades
through a change window, and what they need from a version number is a
**signal about breakage** — semver encodes that in the major component,
CalVer only communicates recency, which isn't the question a self-hosted
customer is asking.

## Tagging convention

Two independent tag namespaces, cut from two different clocks — conflating
them was the thing most likely to break the moment a second release
artifact (the Go binary) joins the CLI:

| Tag format | What it marks | Cut by |
|---|---|---|
| `envhq@X.Y.Z` | A published release of the `envhq` CLI package to npm. | Changesets, automatically, via [`.github/workflows/release.yml`](../.github/workflows/release.yml) when a "Version Packages" PR merges to `main`. |
| `product-vX.Y.Z` | A whole-product enterprise release — the commit an enterprise customer's deployment is cut from. | [`.github/workflows/enterprise-tag.yml`](../.github/workflows/enterprise-tag.yml), manually triggered, gated on the soak rule below. |

`@envhq/web`, `@envhq/crypto`, and `@envhq/parser` are versioned and
changelogged by Changesets (crypto/parser genuinely, web is excluded — see
[`.changeset/README.md`](../.changeset/README.md)) but never published to
npm, so they don't get their own tag namespace.

## The 14-day SaaS production soak

**An enterprise release tag (`product-vX.Y.Z`) may only be cut from a commit
that has been running in SaaS production for 14 days with no incidents.**
Not from `main`, not from a green CI run — from a commit with a two-week
clean production record behind it. This is what turns "we run it ourselves
first" from an intention into an enforced rule, and it's enforced by
[`enterprise-tag.yml`](../.github/workflows/enterprise-tag.yml) requiring
approval against the `enterprise-release` GitHub Environment before the tag
is pushed.

There is no automated production-health signal to check this against yet —
no SaaS deployment or monitoring integration exists at the time of writing.
Until one does, this is enforced by a human: whoever approves the
`enterprise-release` environment gate is attesting, by approving, that the
target commit has genuinely soaked for 14 days with no incidents. Wire up an
automated check here the moment there's a real monitoring signal to check
against — don't let the manual gate become permanent by default.

### Security-fix exception path

Decided **in advance**, per ADR-011's explicit point that this must not be
decided under incident pressure:

- **Who may invoke it:** the project maintainer (or, once one exists, a
  designated security lead).
- **On what criteria:** the fix addresses a vulnerability that is
  actively exploitable or has a realistic near-term exploitation path
  against a deployed instance, and shipping it 14 days sooner materially
  reduces real risk to a customer.
- **How it's recorded:** the `exception_reason` input on the
  [`enterprise-tag.yml`](../.github/workflows/enterprise-tag.yml)
  `workflow_dispatch` run — filled in with the reasoning, which becomes part
  of the workflow run's permanent log. An exception is not a silent
  override; it's a documented, audit-trailed deviation.

## Support window: 12 months per minor release

Each minor release is supported for **twelve months from its release date**.
Support means security fixes and critical bug fixes backported to that
line. Rejected alternatives (N-2 minors, latest-only) are in ADR-011 — the
short version is that both either shrink silently as cadence changes or are
unsellable for a self-hosted product whose upgrades need a change window.

**Currently supported lines:**

| Version | Released | Supported until |
|---|---|---|
| `0.9.0` | 2026-08-11 | 2027-08-11 |

*(Update this table on every release. Only `envhq@X.Y.Z` package releases
appear here until the first `product-vX.Y.Z` enterprise tag exists.)*

The unversioned API path aliases (pre-`/api/v1`) must be maintained for as
long as the oldest row in this table is still supported — support window
and API deprecation share one clock; shortening one without the other
breaks a client on a still-supported version.

## Migration constraints

Follows directly from the support window: a customer may upgrade **from any
supported version to any later one**, skipping everything in between,
unattended. That means every migration under
[`apps/web/src/db/migrations/`](../apps/web/src/db/migrations/) must be:

- **Pure SQL** — no application-code dependency.
- **Forward-only** — no down-migrations to maintain or trust.
- **Idempotent** — safe to apply to a database that may already be partway
  migrated.
- **Never dependent on application code having run between two releases.**
  A migration that needs a backfill script to execute between versions
  silently breaks anyone who skips the version in between: the schema
  change applies, the data it assumed is absent, and nothing reports an
  error until something reads the wrong rows.

Combined with the expand/contract pattern, a destructive schema change
necessarily spans a minimum of two supported releases: expand and
dual-write, backfill, switch reads, then drop the old shape in a later
release. Track the "drop" half somewhere durable — it lands a release or
more after the work that motivated it, and is easy to forget.

## Cutting a release, in practice

1. **CLI package** (`envhq`): open PRs with a `pnpm changeset` entry
   describing the change. On merge to `main`,
   [`release.yml`](../.github/workflows/release.yml) opens/updates a
   "Version Packages" PR; merging that PR triggers the actual `npm publish`
   and pushes the `envhq@X.Y.Z` tag. Update the support table above.
2. **Enterprise product tag**: once a commit has soaked 14 days in SaaS
   production (or the documented exception applies), run
   [`enterprise-tag.yml`](../.github/workflows/enterprise-tag.yml) via
   `workflow_dispatch`, approve the `enterprise-release` environment gate,
   and the `product-vX.Y.Z` tag is pushed automatically.
