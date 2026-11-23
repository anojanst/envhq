# Self-hosting plan

Status: **built** (2026-11-23) — all six phases. Not yet deployed to envhq.dev: see *Rolling out to envhq.dev* below. Reopens the direction
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

## What was built

The phases ran in the order 1, 2, 4, 3, 5, 6. Phase 4 moved ahead of 3 once
the rule below was settled, because it removed the need to sync orgs from
Clerk at all.

**The rule:** orgs, members, roles and invites live only in Postgres and
change only through EnvHQ. The identity provider says who someone is and
nothing else. OIDC has no standard for org membership, and every provider
differs.

| Phase | What landed |
|---|---|
| 1 · Identity seam | `lib/identity/`: who is signed in, and display details. Callers never talk to a provider. |
| 2 · Orgs in Postgres | `orgs`, `org_members` (migration 0016). `lib/orgs.ts` answers every role check from them, per request. Fixed: Clerk's 10-per-page membership lists had truncated orgs with more than 10 members. |
| 4 · Own team management | `/teams` page and `api/orgs/{id}/…`: create, rename, delete, roles, leave. Single-use, hashed, 7-day invite links (`org_invites`, migration 0017; `/invite/[token]`). Invariants in `lib/org-admin.ts`: a team keeps one admin; personal workspaces are single-member; removing someone also removes their grants, group memberships and key wraps in that team, and marks those projects for rotation. |
| 3 · OIDC sign-in | `/auth/sign-in`, `/auth/callback`, `/auth/sign-out` (`openid-client`: code + PKCE, state, nonce). EnvHQ's own encrypted session cookie (`lib/session.ts`, `SESSION_SECRET`), read at the edge by `middleware.ts`. Profiles are written from claims at sign-in. Optional email-domain allow-list. `@clerk/nextjs`, the Clerk webhook and `svix` are removed. |
| 5 · Packaging | `Dockerfile` (standalone Next build, non-root), `deploy/docker-compose.yml`, `deploy/envhq.env.example`. Migrations run on start behind a Postgres advisory lock (`ENVHQ_MIGRATE_ON_START`, set by the image). Vercel analytics render only on Vercel. No "self-hosted mode" flag was needed: `/ops` and alerting are already off unless configured. |
| 6 · Release & verification | `deploy/e2e/selfhost-smoke.sh`, run by `.github/workflows/selfhost.yml`: image boots, migrates, passes health, real OIDC sign-in against a throwaway provider, team created, published CLI pointed at the instance. `.github/workflows/image.yml` publishes `ghcr.io/envhq/envhq` on a human-pushed `product-v*` tag. Public docs: `/docs/self-hosting`. |

## Rolling out to envhq.dev

These steps need a person with dashboard and database access. **Do them in
order, before pushing these commits to `main`** (a push deploys):

1. **Clerk dashboard → OAuth applications → add one.** Redirect URI
   `https://envhq.dev/auth/callback`; scopes `openid email profile`; consent
   screen **off** (EnvHQ is first-party). Note the client ID and secret.
   Confirm your Clerk plan includes OAuth applications on production.
2. **Vercel → Project → Environment Variables (Production):**
   - `OIDC_ISSUER` = the instance's Frontend API URL (`https://clerk.envhq.dev`
     or the `*.clerk.accounts.dev` one)
   - `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` from step 1
   - `SESSION_SECRET` = `openssl rand -base64 48`
   - Remove `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY` and
     `CLERK_WEBHOOK_SIGNING_SECRET`. Nothing reads them any more.
3. **Migrate production:** `pnpm --filter @envhq/web db:migrate` with the
   production `DATABASE_URL` (adds `org_invites`).
4. **Clerk dashboard → Webhooks:** delete the endpoint for
   `/api/webhooks/clerk`. The route no longer exists. Organizations can be
   switched off in Clerk.
5. **Push `main`.** Everyone signs in once more. Existing data was declared
   disposable, so wipe it or let old accounts start fresh.

## Risks

- **Org rows are authorization data.** A wrong membership leaks secrets
  across orgs. Mitigation: the access matrix runs against real `org_members`
  rows in CI (`orgs-db`), and every team mutation goes through
  `lib/org-admin.ts`.
- **Everyone signs in once more** when this reaches envhq.dev. CLI tokens
  are unaffected (they are EnvHQ's own API tokens, not Clerk's).
- **Clerk plan gating** of OAuth applications on production. Check it before
  rollout step 1. If it isn't included, envhq.dev can point `OIDC_ISSUER` at
  any other OIDC provider. Nothing in the code is Clerk-specific.
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
