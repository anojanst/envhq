# Crypto suite v2: approved algorithms on the platform's crypto module

**Status:** Accepted · **Decided:** 2026-11-28 · Built as a clean break.

## Why

EnvHQ's original crypto (v1) used XChaCha20-Poly1305, X25519 and Argon2id in
pure JavaScript (`@noble/*`). All three are strong, but none is on the FIPS
140 approved list, and none ran inside a validated module. Anyone checking
would see those gaps.

**What this is not:** a certification effort. EnvHQ isn't seeking FIPS
validation. The goal is to use only approved algorithms, run by the
platform's own crypto module, which is already validated in most
deployments:
- in browsers, WebCrypto: BoringSSL in Chrome, NSS in Firefox;
- in the CLI, Node's crypto: OpenSSL, with its FIPS provider where the
  operator enables it.

The zero-knowledge invariant is unchanged. Everything still runs on the
client, and the server still only stores ciphertext and sealed keys.

## The suite

| Job | Algorithm | Format |
|---|---|---|
| Values, private-key wraps | AES-256-GCM | random 12-byte IV; the 16-byte tag is appended to the ciphertext |
| User and deploy keypairs | ECDH P-256 | public key: raw uncompressed point (65 bytes, `0x04…`); private key: PKCS#8 |
| Sealing a DEK to a public key | ephemeral P-256 ECDH → HKDF-SHA256 (`info = "envhq/seal/v2" ‖ eph ‖ recipient`, empty salt) → AES-256-GCM key and IV | `eph public key (65) ‖ ciphertext+tag` |
| Passphrase → Master Key | PBKDF2-HMAC-SHA256, 600,000 iterations | `user_keys.kdf_iterations`; the API sends `kdfAlg: "pbkdf2-sha256"` |
| Keyed value tag | HMAC-SHA256 | — |
| Key fingerprint | first 8 bytes of SHA-256(public key) | `3F9A 0C12 …` |

All of it lives in `packages/crypto` and uses `crypto.subtle` only. That
package has no dependencies.

**Formats reject the old suite with a clear message.** A 24-byte nonce, a
32-byte public key, or KDF parameters without `alg: "pbkdf2-sha256"` fail with
"encrypted in a format EnvHQ no longer reads", never with a bare AEAD error.

**Needs a secure context.** Browsers only expose `crypto.subtle` over HTTPS or
on localhost. A self-hosted instance on plain HTTP at a LAN address can't
encrypt, and the app says so.

**Speed.** PBKDF2 at 600,000 iterations takes about 50 ms in Chrome's native
WebCrypto. Argon2id in pure JavaScript took about 1 s.

## Clean break, not migration

When this was decided, production held almost nothing: 2 projects, 1
variable and no deploy keys. So instead of a dual-format migration, migration
`0018` deletes everything the old suite had encrypted:

- `user_keys`, `project_keys`, `env_vars` and `environment_versions`;
- `deploy_keys`, along with their API tokens.

It also resets `projects.key_version`, `key_rotation_pending` and
`environments.version`.

What stays: projects, environments, orgs, members, grants, groups and personal
tokens. Each user sets up encryption again on their next visit.

The retired Argon2id columns (`user_keys.kdf_t/m/p`) are nullable and never
written. They remain so that code from before the deploy can still read the
table during the rollout window. **Drop them in a later migration** (the
contract half of expand/contract, `docs/RELEASE_POLICY.md`).
`kdf_iterations` is `NOT NULL`, so old code can't write a v1 identity once
the migration has run.

## Old CLIs

The CLI sends `X-EnvHQ-Crypto: 2` on every bearer request. The server's
middleware (`apps/web/src/lib/client-version.ts`) answers any bearer request
without it with **426** and an `error` telling the user to run
`npm install -g envhq@latest`. Old binaries print the server's `error` text
verbatim, so they show that instruction rather than a decryption failure.

Exceptions:
- Browser (cookie) requests are never checked.
- `/api/cli/*`, the frozen login exchange, is exempt.

A future format change bumps this version.

Deploy keys are now `envhq_dk_v2.<public>.<private>`. A `v1` key fails with
an "issue a new deploy key" message. The GitHub Action pins `envhq@0.12.0`,
the first CLI on v2.

## Rollout

1. Merge to `main`. Vercel deploys the app, and the Changesets workflow
   opens the "Version Packages" PR. Merging that PR publishes
   `envhq@0.12.0`.
2. Run the migration against the production database:
   `pnpm --filter @envhq/web db:migrate`, using the web app's production
   `DATABASE_URL` from the Vercel project settings.
3. Mirror `packages/github-action` to `envhq/envhq-action`; it pins 0.12.0.
4. Everyone sets up encryption again and issues new deploy keys.

Between steps 1 and 2, the new app sees old-format rows and refuses them with
the "no longer reads" message. Keep that window short.
