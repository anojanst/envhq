# EnvHQ — How CI Decrypts: the Deploy-Key Design

**Status:** Accepted · **Decided:** 2026-09-19 · Recorded in Notion as ADR-020.

EnvHQ never holds a key that can decrypt a customer's values. A CI job needs
plaintext. Those two sentences are in tension, and this document resolves it
once, in writing, before any pipeline code is written.

The resolution is not clever: **something in CI must hold a decryption key.**
There is no arrangement in which that is untrue. The only real questions are
what that thing is, how it gets there, what it can reach, and what happens when
it leaks. Answering them up front is the point — under schedule pressure, the
cheap answer ("just let the server decrypt for CI") is always available, and it
ends the product's central claim quietly, as an implementation detail in
somebody's pull request.

## Context — why a token is not enough

A pipeline authenticating with a project-scoped, read-only personal access token
can already fetch an environment: `GET /api/environments/:id/export` returns
ciphertext pairs, and a token is sufficient authorization for that route.

It cannot decrypt them. Values are encrypted under a per-project Data Encryption
Key (DEK), and every existing copy of that DEK is sealed to a *member's* X25519
public key. Unsealing needs that member's private key, which is wrapped under a
passphrase-derived master key. In the CLI, this is
[`resolveKeypair()`](../packages/cli/src/crypto-session.ts): it returns either
an OS-keychain cache left behind by a previous **interactive** unlock, or it
prompts for a passphrase. A CI runner has neither a keychain from a prior
session nor a human to answer a prompt.

This corrects a claim in **ADR-018**, which sized the GitHub Action as needing
"no new backend work" because project-scoped read-only tokens already exist.
That is true of *authentication* and false of *decryption*. The Action as
described there would fetch ciphertext successfully and then block forever on a
passphrase prompt. A deploy key is new backend work, and ADR-018's sizing should
be read as superseded by this document.

## The decision

Introduce a **deploy key**: an X25519 keypair generated in the browser, scoped to
one project, belonging to no human.

- The keypair is generated **client-side**, in the same browser session that
  already holds an unlocked project DEK. The server never sees the private half.
- The private half is displayed **once**, at creation. The customer stores it as
  a CI secret — `ENVHQ_DEPLOY_KEY`. EnvHQ cannot show it again and cannot
  recover it. This is the same one-time-display contract the recovery phrase
  already uses (`settings/security/security-manager.tsx` — "it's shown only
  once", followed by a confirm-you-saved-it step); reuse that flow rather than
  inventing a second one.
- The server stores the project's DEK **sealed to the public half**, using the
  existing [`sealToPublicKey`](../packages/crypto/src/index.ts) — the
  identical operation that seals a DEK to a member today. From the server's
  perspective a deploy key's wrap is indistinguishable from a member's: an
  opaque sealed blob it cannot open.
- A pipeline therefore needs **two secrets**: an API token to authenticate the
  fetch, and the deploy key to decrypt what comes back.

The two-secret split is deliberate and is the design's main security property.
They are stored in the same place (CI secrets) and a full compromise of the CI
system yields both — that is honest and unavoidable. What the split buys is that
every *partial* compromise is survivable, and those are the common ones: a leaked
token in a build log, an over-broad token scope, a stolen backup of EnvHQ's own
database. None of those alone yields plaintext.

## What an attacker gets with each secret alone

| They hold | They get | They do not get |
|---|---|---|
| **API token only** | Ciphertext for the token's scope, **plus every variable name in plaintext** | Any variable value |
| **Deploy key only** | Nothing | No way to fetch ciphertext; the key alone decrypts nothing |
| **Both** | Full plaintext for the whole project | Access to other projects |
| **EnvHQ's database** | Ciphertext, sealed DEK wraps, variable names, token *hashes* | Any value, and any usable key — every wrap is sealed to a key the server does not hold |

The variable-names row is a real disclosure, not a technicality. Names are stored
unencrypted by an accepted, still-live decision (**ADR-012**), so a leaked token
tells an attacker that a project has `STRIPE_SECRET_KEY` and `DATABASE_URL`,
which is useful reconnaissance even without the values. Anyone relying on this
design should know that, which is why it is in the table rather than a footnote.

Token hashes are not usable credentials: `api_tokens` stores a SHA-256 hash, and
the token itself is shown once at creation.

## Scope: per project, and what "per environment" can honestly mean

**A deploy key is issued per project, and it decrypts the whole project.**

This is forced by the data model, not chosen for convenience. DEK granularity is
per-*project* by an explicit decision recorded at
[`schema.ts:90`](../apps/web/src/db/schema.ts): `cloneVars`
([env-store.ts:167](../apps/web/src/lib/env-store.ts)) and `restoreSnapshot`
([version-store.ts:109](../apps/web/src/lib/version-store.ts)) copy
`env_vars` ciphertext directly between environments of a project with no
decrypt/re-encrypt step, which only works because every environment in a project
shares one DEK. There is no per-environment DEK in existence to seal a deploy key
to.

So per-environment restriction can be offered, but only as an **authorization cap
on the token** — the API refuses to serve ciphertext for environments outside the
allowed set, the way `env_scope` already caps grants per environment
([access.ts:81](../apps/web/src/lib/access.ts)). Worth noting that today a
token's scope is only `{ projectId, capability }`, with no per-environment
dimension, so this is additive work for RM-11.

**State this plainly in the product UI, because it is easy to misread.** A
deploy key restricted to `staging` is restricted by the server's willingness to
serve it, not by mathematics. The key itself opens every environment in the
project. Anyone who obtains that key together with ciphertext from another
environment — a database leak, a misconfigured backup, a second token — reads
production. Calling that "scoped to staging" without qualification would be
telling customers they have an isolation guarantee they do not have.

The ticket framed this as "per environment is safer and more work." It is safer
only at the authorization layer, and the honest version is: use it as defence in
depth, never as a boundary you would bet production on. Genuine per-environment
isolation would require per-environment DEKs, which would break `cloneVars` and
`restoreSnapshot` and is a much larger change than a scoped token — it is not
ruled out forever, but it is not this design.

## Identity and lifecycle: a deploy key is not a member

A deploy key gets its **own subject identity**, separate from any human's.

The tempting shortcut is to hang the pipeline's wrap off the engineer who created
it. That fails in both directions, and both failures are routine rather than
exotic: when that engineer leaves and is deprovisioned, production deployments
break for reasons nobody connects to the offboarding; and revoking a compromised
pipeline key would revoke a working employee's access.

The constraint this creates for implementation: `project_keys.subject_user_id` is
a `text` column carrying a Clerk user id, with a unique `(project_id,
subject_user_id)` index. A non-human subject needs either a reserved,
unspoofable id namespace or a table of its own. RM-11 chooses; this document only
requires that the identity and its lifecycle are genuinely independent of any
member's. `api_tokens.kind` already exists as a discriminator
([schema.ts:248](../apps/web/src/db/schema.ts), default `"pat"`), so the
token half has a natural home.

A deploy key must also carry enough metadata to be auditable: who created it,
when, when it was last used, and what it is for. A pipeline credential nobody can
attribute is one nobody dares to revoke.

## Revocation

Revoking a deploy key mirrors removing a member exactly, because it is the same
operation on the same table:

1. **Delete its wrap**, as
   [`deleteProjectKeyForUser`](../apps/web/src/lib/project-keys.ts) does. The
   key can no longer obtain the DEK.
2. **Mark the project rotation-pending**, as
   [`markRotationPending`](../apps/web/src/lib/project-keys.ts) does on every
   revoke. Dropping a wrap does not un-learn a DEK that was already unsealed.
3. **Revoke its API token in the same action.** These are two records and it
   would be easy to remove one; a holder who keeps a live token continues reading
   ciphertext and variable names indefinitely. Revocation must be one
   user-facing action that ends both.

## Rotation

Rotation is where the current code would actively break a pipeline, so this needs
to be built rather than assumed.

[`finalizeRotation`](../apps/web/src/lib/project-keys.ts) computes the set of
wraps it expects from `listAccessibleUserIds()` filtered to members who have
completed encryption onboarding, refuses any submission that does not match
exactly (`membership_mismatch`, deliberately computed server-side so a client
cannot forge the list), and then deletes every wrap not in the submitted set.

A deploy key enrolled as a `project_keys` row and unknown to that computation
would therefore make **every rotation fail**, and — once a client was changed to
get past the mismatch — be **silently deleted at finalize**. The decision:
**active deploy keys are part of a project's expected wrap set.** Rotation
re-seals the new DEK to each active deploy key's public half, which it can do
without the private half, exactly as it re-seals to members.

**A pipeline running during a rotation keeps working.** That falls out of the
existing two-phase design rather than needing anything new: phase one re-encrypts
`env_vars` to a new DEK while leaving the old DEK and all its wraps intact, so a
job that unsealed the old DEK and fetched ciphertext before the cutover holds a
consistent pair. Finalize is the cutover; a job starting afterwards gets the new
DEK and newly-encrypted values.

**The one window that does not resolve cleanly** is a job that unsealed the old
DEK, then fetched ciphertext *after* finalize — a long-running job that pulls an
environment late, or retries a step. It holds the old key and new ciphertext, and
decryption fails. It fails **closed**, with an authentication-style error rather
than corrupt values, which is the right direction. Two requirements follow: the
error must say "the project key rotated during this job, re-run it" rather than
surfacing a raw decrypt failure, and `exportEnv` should return the DEK version
the ciphertext belongs to so the client can detect the mismatch rather than infer
it from a decryption error. `env_vars.key_version` and `projects.key_version`
already exist to support exactly this.

## GitHub OIDC: it replaces the token, never the key

GitHub Actions can present a signed OIDC identity token proving which repository
and workflow is running. EnvHQ can verify that and mint a short-lived API token
in exchange, removing the long-lived `ENVHQ_TOKEN` from the customer's secrets
entirely. That is a genuine improvement and worth doing.

**It cannot replace `ENVHQ_DEPLOY_KEY`, and no amount of OIDC will change that.**
OIDC proves *who is calling*. Decryption requires *key material the server has
never possessed*. For an OIDC exchange to return something that decrypts values,
EnvHQ would have to be holding a key that decrypts values — which is the precise
thing this product does not do. An OIDC-only pipeline is not a stronger version
of this design; it is the abandonment of it, wearing a better protocol as
justification.

This is written down because it is the most plausible-sounding wrong turn
available here. "We can drop the deploy key now that we have OIDC" will sound
like a simplification when someone proposes it, and it is not one.

## If a deploy key leaks

1. **Revoke it** — wrap and token together, per above.
2. **Rotate the project DEK.** Mandatory, not advisory. Revocation stops *future*
   fetches; it does nothing about ciphertext the holder already copied, which
   they can decrypt at leisure with the key they still have. Until the DEK is
   rotated and values re-encrypted, a leaked key means a permanent compromise of
   everything it ever had access to.
3. **Issue a new deploy key and update the CI secret.**
4. **Treat every value in the project as exposed** and rotate the underlying
   credentials — the database passwords, the API keys — not just EnvHQ's copies
   of them. EnvHQ can re-encrypt a value; it cannot make an attacker forget a
   Stripe key they already read.

Step 4 is the one customers will skip. The revocation UI should say it.

## Rejected: every design where EnvHQ can decrypt

Rejected, with the reasoning extending **ADR-019**, which already rejected
server-side decrypt and platform-token custody for auto-sync:

**A server-held private key** — enrolling an integration identity in
`project_keys` whose private half EnvHQ stores, so CI authenticates and the
server returns plaintext. This is the shortcut the ticket names. It means the
server can decrypt any opted-in project, at will, permanently, with no human
involved. Every other decision in this codebase exists to make that impossible;
introducing it for CI convenience reopens the custodial question the commercial
plan is built to avoid, and does so per-feature and quietly rather than as a
deliberate change of product.

**A server-side re-encryption proxy** — the server unseals the DEK, re-encrypts
values to a per-job key, and hands them over, "without storing anything." It
stores nothing and decrypts everything. Transience is not the property that
matters; possession is. A server that can decrypt on request is a server that can
be compelled, subpoenaed, or breached into decrypting on request.

**Storing the deploy key's private half server-side "encrypted at rest"** — the
convenience fix for customers who lose the one-time display. Encrypted at rest
with a key the server controls is a rename, not a protection: the server can
decrypt it, therefore the server can decrypt values, therefore this is the first
rejection with extra steps. Losing a deploy key is recoverable by issuing a new
one; that is the intended path and it is cheap.

**Weakening the one-time display** — showing the private half again on request,
or emailing it. Same conclusion by a shorter route: the server would have to keep
it.

None of these is rejected as impossible or even as unreasonable for a different
product. They are rejected because each one converts EnvHQ from a system that
cannot read customer secrets into a system that chooses not to, and that
difference is the entire product. If a customer ever genuinely needs one — a
zero-touch pipeline with no key of their own — that arrives as its own proposal
with its own security review, not as a convenience patch to a pipeline ticket.

## What this changes elsewhere

- **ADR-018** — its "no new backend work" sizing for the GitHub Action is
  superseded, and ADR-018 now carries a dated correction in place pointing here
  (in its "Decision — GitHub Action first" section, and on the first consequence
  that restates the same claim). The `envhq run` primitive and the
  ephemeral-injection model (no disk writes) are unaffected and remain the right
  shape; only the claim that a token alone suffices is wrong.
- **ADR-019** — unaffected and reinforced. `envhq sync` runs on a machine holding
  a deploy key exactly as `envhq run` does.
- **ADR-012** — the unencrypted-variable-names gap is now also a CI exposure, as
  the attacker table records. It does not block this design; it is one more
  argument for eventually closing that gap.
- **RM-11** inherits the open implementation choices this document deliberately
  leaves open: the subject-identity storage shape, the per-environment token
  scope column, and surfacing the DEK version on `exportEnv`.
