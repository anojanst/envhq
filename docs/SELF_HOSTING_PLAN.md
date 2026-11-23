# Self-hosting plan

Status: **agreed direction, not started** (2026-11-23). Reopens the direction
retired on 2026-09-18 (`7d5e990`, "retiring self hosting roadmap").

Goal: an organization can run EnvHQ inside its own network, sign in with its own
identity provider, and point the existing CLI and GitHub Action at it.

## The approach: EnvHQ speaks only OIDC

EnvHQ signs people in with standard OpenID Connect and nothing else. Which
identity provider sits behind it is configuration:

| | envhq.dev (SaaS) | A customer's own install |
|---|---|---|
| EnvHQ code | OIDC sign-in | the **same** OIDC sign-in |
| Identity provider | **Clerk**, acting as an OIDC provider | **theirs** — Okta, Entra ID, Google Workspace, Keycloak, any OIDC IdP |
| Orgs, members, roles | Postgres | Postgres |
| Outbound calls to third parties | Clerk (sign-in only) | none |

Why this over the alternatives considered:

- **One code path.** Self-hosted installs run exactly what envhq.dev runs every
  day, so self-hosting is exercised in production instead of drifting.
- **One place for authorization data.** Orgs and roles live in Postgres in both
  modes, so the access matrix is tested against one org backend, not two.
- **No forced vendor.** A customer brings their own IdP; nobody needs a Clerk
  account. EnvHQ itself can later move off Clerk by changing config.

Rejected: keeping Clerk's SDK for SaaS alongside OIDC for self-hosted (two
identity paths and two org backends forever), and replacing Clerk with an auth
library before self-hosting exists (migrates every SaaS user first, for no
visible benefit).

### Clerk as an OIDC provider — checked 2026-11-23

- The dev instance (`loving-tiger-60.clerk.accounts.dev`) already serves
  `/.well-known/openid-configuration`: authorization code + PKCE (`S256`),
  refresh tokens, `userinfo`, claims `sub`, `email`, `email_verified`, `name`,
  `picture`, `preferred_username`.
- `sub` is the Clerk user ID ("matches the authenticated user ID",
  clerk.com/docs/advanced-usage/clerk-idp), the same value every `user_id`
  column holds today — **no user-ID migration**. Confirm the literal `user_…`
  format with one real sign-in at the start of phase 3.
- OIDC carries **no org memberships or roles** — at most one consent-chosen
  `org_id`. Hence orgs move to Postgres (phase 2).
- EnvHQ's OAuth application in Clerk must have the **consent screen off**: it is
  our own first-party app, and otherwise every sign-in asks "allow access?".
- Plan availability isn't documented. **Check the production Clerk instance's
  dashboard before phase 3.**
- Lifetimes (Clerk docs): access and ID tokens 1 day, refresh tokens don't
  expire. EnvHQ's own session cookie sets the real session length.

## What already works against a self-hosted server

No client changes are needed:

- **CLI** — `envhq login --url https://envhq.corp.example` once; the URL is
  saved in the global config. `ENVHQ_URL` overrides it for scripts and CI
  (`packages/cli/src/config.ts`). The frozen `/cli/authorize?port=&state=&challenge=`
  flow only needs a signed-in browser session, whatever created it.
- **GitHub Action** — `env: { ENVHQ_URL: … }` on the job, on a runner that can
  reach the server (a self-hosted runner, for a private network).
- **Zero-knowledge** — encryption happens in the browser, CLI and runner.
  `packages/crypto` is not touched by anything in this plan.
- **Licensing** — the server is under the Elastic License 2.0, which permits
  self-hosting for your own organization.

## What changes in `apps/web`

At runtime the app needs Postgres and Clerk; Clerk currently does four jobs:

| Job today (Clerk SDK) | Where | After |
|---|---|---|
| Sign-in / session — `auth()`, `clerkMiddleware`, `<SignIn>`, `<SignUp>` | `lib/auth.ts`, `middleware.ts`, `sign-in`, `sign-up`, 10 pages | OIDC (`openid-client`) + EnvHQ's own encrypted session cookie |
| Orgs, membership, **roles** — `clerkClient().organizations…` | `lib/orgs.ts`, `api/orgs/members`, `api/projects/[id]/access/members` | Postgres: `orgs`, `org_members`, `org_invites` |
| User directory — names, emails, avatars | `lib/user-profiles.ts`, `api/webhooks/clerk` | Claims written to `user_profiles` at every sign-in; webhook retired |
| Org UI — `<OrganizationProfile>`, `<UserButton>` | `teams/[[...rest]]`, `app-shell.tsx` | EnvHQ's own members/invites page and account menu |

Platform extras to make optional in self-hosted mode: `@vercel/analytics`,
`@vercel/speed-insights`, the staff `/ops` page and outbound alerting (RM-18).

## Phases

Each phase lands on `main` on its own, and envhq.dev keeps working after each.

### 1 · Identity seam — no behaviour change (2–3 days)
- `lib/identity/`: `currentUser()`, `requireUser()`, `resolveUsers(ids)`. One
  adapter for now, wrapping today's Clerk SDK calls.
- Every `auth()` and `clerkClient().users` call goes through it.
- Done when only `lib/identity/*` and `lib/orgs.ts` import `@clerk/*`, and every
  existing test passes unchanged.
- Design reference: `apps/api/internal/identity/identity.go` on the local branch
  `archive/go-api-1044fda` — identity answers *who is this*, never orgs or roles.

### 2 · Orgs into Postgres, and migrate SaaS (5–7 days) — highest risk
- Tables `orgs`, `org_members` (role `admin|member`), `org_invites` (token hash
  + expiry, the `cli_auth_requests` pattern). Existing `org_id` values are kept
  as-is, so `projects.org_id` and every grant still point at the same org.
- `lib/orgs.ts` reads Postgres instead of Clerk. Roles still resolve **per
  request** with `cache()` only — the invariant in CLAUDE.md is unchanged except
  for where the row lives.
- One-off migration script: copy every Clerk org, membership and role into
  Postgres; idempotent; dry-run mode that prints counts and diffs.
- Rollout: deploy reading Postgres behind a flag; run the migration; compare
  Clerk vs Postgres answers for real requests (shadow read, counts only); flip.
  Until phase 4 ships, Clerk-side org changes are mirrored via the existing
  webhook so the two can't diverge.
- **Gate:** the `authz-db` access matrix passes with no change to
  `access-matrix.fixtures.json`, plus new cases for invites and role changes.

### 3 · OIDC sign-in, everywhere (4–6 days)
- `lib/identity/oidc.ts` on `openid-client`: authorization code + PKCE,
  discovery from `OIDC_ISSUER`, with `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
- Session: encrypted, HTTP-only, `SameSite=Lax` cookie (`jose`); sliding expiry;
  logout clears it and calls the IdP's end-session endpoint where offered.
- `/sign-in` is one "Continue" button that redirects to the IdP. No `/sign-up`:
  the IdP decides who exists. Optional `OIDC_ALLOWED_EMAIL_DOMAINS`.
- First sign-in of a brand-new user creates their personal org (today's
  behaviour). On a fresh self-hosted instance the first user becomes instance
  admin, or `ENVHQ_BOOTSTRAP_ADMIN_EMAIL` decides.
- envhq.dev switches to Clerk-as-OIDC: register EnvHQ as a Clerk OAuth app
  (consent off), set the three env vars. Existing users sign in once more and
  keep all their data, because `sub` equals their existing user ID.
- Static pages stay static: the session is read in `middleware.ts` and
  `(app)` routes only, never on `/`, `/terms`, `/docs/**`.

### 4 · Our own org and account UI (3–4 days)
- `/teams` becomes EnvHQ's own page — members, roles, invite links,
  leave/remove — following `settings/groups`; breadcrumb header, empty and
  loading states, collapsed sidebar.
- Invites are copyable links; no email service required (SMTP optional later).
- `<UserButton>` → EnvHQ's account menu (name, email, sign out).
- After this, `@clerk/*` is no longer a dependency of `apps/web` at all, and
  the Clerk webhook route is removed.

### 5 · Packaging (3–4 days)
- `output: "standalone"`; multi-stage `Dockerfile`, non-root, Node 24.
- `docker-compose.yml`: app + Postgres 17 + volume. Migrations run on start,
  before the server listens.
- `/api/health` as the container health check.
- Self-hosted mode (`ENVHQ_MODE=selfhosted`) switches off Vercel analytics,
  `/ops` and outbound alerting; errors go to stdout as structured logs.
- `.env.selfhosted.example`; startup fails loudly on missing settings.
- TLS via the customer's reverse proxy (document Caddy and nginx).
  `docs/OPERATIONS.md`'s `instances × pool max` rule applies unchanged.

### 6 · Release, docs, verification (3–4 days)
- Image `ghcr.io/envhq/envhq:<product-version>` from a revived
  `enterprise-tag.yml` (human-gated after the SaaS soak; the workflow is on
  `archive/go-api-1044fda`).
- CI: build the image, `docker compose up` with a throwaway OIDC provider
  (Keycloak or a mock-OIDC container), sign in, then push and pull a secret with
  the real CLI using `--url`.
- `/docs/self-hosting`: requirements, compose quick start, IdP setup for Entra,
  Okta, Google and Keycloak, upgrades, backups (Postgres only — ciphertext, so
  backups hold no plaintext), pointing the CLI and Action at the instance.
- `CLAUDE.md`: "cached identity is decorative; roles are not" now refers to
  Postgres orgs; repo map gains `lib/identity/`, Docker files, the new docs.

**Total: roughly 4–5 weeks**, most of it phases 2–4.

## Risks

- **Phase 2 is a SaaS data migration of authorization data.** A wrong
  membership leaks secrets across orgs. Mitigations: idempotent script with dry
  run, shadow comparison before the flip, the access matrix as the gate, and a
  flag to fall back to Clerk reads until phase 4.
- **Everyone signs in once more** when phase 3 reaches envhq.dev. Announce it;
  CLI tokens are unaffected (they are EnvHQ's own API tokens, not Clerk's).
- **Clerk plan gating** of the OIDC provider on production — checked before
  phase 3; fallback is to keep Clerk's SDK for SaaS sign-in only, behind the
  phase-1 seam.
- **Support load** — customers' IdPs, proxies and Postgres versions vary. Start
  with one documented compose setup; Helm later.
- **Key loss stays the customer's.** Zero-knowledge means a self-hosted admin
  who loses every member's key loses the data. Say so in the docs.

## Open questions (business, not code)

1. Free under ELv2, or a paid enterprise licence?
2. Which IdPs to certify first? (Proposal: Entra ID, Okta, Google, Keycloak.)
3. Support model and upgrade cadence for self-hosted customers.
4. Is a named customer driving this? Their IdP and deploy target should shape
   phases 3 and 5.
