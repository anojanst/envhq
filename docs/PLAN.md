# EnvHQ — Design Plan

Living design document. Captures the decisions made for EnvHQ beyond v1, with
rationale and open questions. Sequencing lives in [ROADMAP.md](./ROADMAP.md).

> **Rebrand note:** this project was originally named **envsync**
> (`envsync.dev`, `@envsyncdev/cli`, `.envsync/`, `ENVSYNC_*`) and was
> rebranded to **EnvHQ** (`envhq.dev`, `envhq` npm package, `.envhq/`,
> `ENVHQ_*`). This document uses current (post-rebrand) naming throughout.

**Vision:** a "git for environment variables" — store secrets by project and
environment, sync them from the terminal, with versioned history and team access.
Cloud is the source of truth.

---

## Current state (v1 — shipped)

- **Monorepo** (pnpm): `apps/web` (Next.js + Clerk + Neon/Drizzle + shadcn),
  `packages/parser` (shared `.env` parse/serialize), `packages/cli` (`envhq`).
- **Model:** personal-only. `projects → environments → env_vars`, everything
  scoped by Clerk `userId`.
- **Encryption:** values AES-256-GCM encrypted at rest with a single server-side
  `ENV_ENCRYPTION_KEY` (server can decrypt).
- **CLI:** `login` (paste token) / `link` / `push` / `pull` / `status`, plus
  `projects`. Auth = personal access token (SHA-256 hashed, revocable).
- **Deployed:** web at `https://envhq.dev` (apex primary). CLI publishes to npm
  as `envhq` (command: `envhq`), prod URL baked at build.

---

## Cross-cutting invariants

These hold across all features — violating them breaks correctness:

1. **The sync base is keyed by _environment_, never by filename.** The `--file`
   mapping is convenience only.
2. **The base stores key _names_ only** (no values, no hashes) — zero secret
   material on disk. Change detection happens live against the server.
3. **The base is CLI-owned, human-read-only**, written only from the server's
   authoritative response at the commit point of a successful sync, and harmless
   if lost (degrades to merge-only).
4. **All EnvHQ CLI state is gitignored** — everything lives under `.envhq/`.

---

## 1. Sync model — cloud as source of truth, three-way merge

**Decision:** Cloud is SoT. Reconciliation is three-way (base / local / remote).

- **base** = `{ version, keys: [names] }` per environment, in `.envhq/`.
- **`push`** diffs base→local:
  - `local − base` → **add**
  - `base − local` (∩ remote) → **delete** (only keys removed since last pull)
  - keys in both, value differs from remote (live compare) → **update**
  - a cloud key never in base → **left untouched** (saves partial-file disasters)
- **`pull`** overwrites local, refreshes base + version.
- **Deletions are soft** (`env_vars.deleted_at`) + restore + trash view.
- **`envhq diff` / `status`** preview added/changed/deleted; **confirm on
  deletions**; extra confirm for sensitive envs.

**Known sharp edges (must be handled):**
- **Pull must not clobber local edits** on a conflict — refuse / back up to
  `.env.bak` / show diff. (Coupled to versioning conflict resolution.)
- Empty/partial local file → mass delete: mitigate with confirm + a threshold
  ("deleting >50% of keys"); trash makes it recoverable.
- Soft-delete needs a **partial unique index** `WHERE deleted_at IS NULL`, and an
  `ON CONFLICT` targeting that predicate, so a deleted key can be re-created.

**Open:** exact conflict-resolution UX (see §5) — deferred.

## 2. Project creation via CLI

**Decision:** `envhq init` (bootstrap) + `envhq projects create <name>`.

- `init`: create project (name defaults to folder name), create env(s), link the
  folder, write `.gitignore`. Idempotent (detects already-linked).
- `projects create <name>`: `--env dev,staging` (default single `dev`),
  `--no-link`.
- **Project names unique per user/org** → `unique(owner, name)` + `409` on
  conflict. Migration must dedupe existing names first.
- Web project-create must also handle `409` for consistency.

## 3. `--file` / `--env` decoupling  ✅ (already works)

`push --env uat --file .env.qa` and the `pull` equivalent already work — flags are
independent. The base stays env-keyed so this is safe. Confirmation diff carries
the full `file → env` target so wrong-target mistakes are visible.

## 4. Env creation + multi-env workspace link

**Decision:**
- `envhq env create <name>` (in linked project; `--project` to override);
  `--from <env>` clones another env server-side (ciphertext copied directly).
  **No auto-link**; `--link` to opt in. `envhq env list`.
- **Multi-env link** (`.envhq/config.json`): project + `environments: { name →
  { id, file } }` + `default`. `push <env>` / `pull <env>` positional; no-arg →
  default; `--file` overrides; `--all` explicit only.
- Interactive `link` maps each env to a file (default env → `.env`, others →
  `.env.<name>`); `env map <env> <file>` to adjust.
- **Prod guard:** envs named `prod`/`production` (or flagged sensitive) require an
  extra confirm / `--yes`.

## 5. Versioning — "git for env"

**Decision:** linear, per-environment **integer sequence** versioning
(`v1 → v2 → v3`). No branches. Each `push` carries a commit-style message.

- **Optimistic concurrency:** push sends the **base version** it worked from;
  server compare-and-swaps ("if current == base, apply + allocate next; else
  `409`"). The server owns version allocation.
- **Key-level conflict detection is server-side:** because the server holds all
  version snapshots, it can report exactly which keys collide (server value vs
  your value) — even though the client base holds only names.
- **Storage:** full **snapshot per version** (env vars are tiny) → trivial diff /
  rollback / blame. Web edits also create versions (need a message/granularity
  policy — auto-message or batch-on-save).
- Subsumes v1's soft-delete/trash and the concurrency `version`.

**Depends on:** §1's non-clobbering pull (resolution loop needs it).
**Open:** conflict-resolution UX (rebase/replay flow) — to be designed.

## 6. Security — encryption posture

**Near-term (server-side encryption, today):** harden access with **scoped +
expiring tokens** and audit. Server can decrypt (web UI works, easy recovery).

**Target (deferred epic — needs its own architecture pass): zero-knowledge /
E2E.** Server stores only ciphertext, cannot decrypt.
- Key hierarchy: passphrase → Argon2id → Master Key → unwraps random **User
  Key**; per-project **DEK** wrapped by User Key (and by members' public keys for
  sharing); values AES-256-GCM under the DEK, client-side.
- **Asymmetric user keypair from the start** so team sharing = wrap DEK to a
  member's public key (no re-architecture later).
- **Device enrollment** + OS keychain for CLI/browser key material; the **API
  token becomes auth-only** (a leaked token fetches ciphertext it can't decrypt).
- **Recovery Kit** (offline secret) is mandatory — lost passphrase = lost data.
- **Costs / conflicts:** web UI must decrypt in-browser; import moves client-side
  (parser already runs client-side); server-side env clone needs per-**project**
  DEK; server-side key-level conflict (§5) needs **keyed HMAC tags** to compare
  equality without decrypting; metadata (key names) still visible unless also
  encrypted.
- **Open (deferred):** DEK granularity (project vs env), device-key mechanism,
  metadata encryption scope.

## 7. CLI login mechanism — browser auth + expiring token

**Decision:** replace paste-a-token with **loopback browser auth**.

- Flow: CLI starts `127.0.0.1:<port>` + PKCE verifier → opens
  `/cli/authorize?port&state&challenge` (Clerk-protected) → user approves →
  server mints a **7-day** token + redirects a **one-time code** to loopback →
  CLI exchanges `code + verifier` over HTTPS for the token. **Token never appears
  in a URL.**
- **Storage:** **OS keychain only** (interactive) or **`ENVHQ_TOKEN`** env
  (headless/CI). **No plaintext token file, ever.** No keychain → refuse to
  persist, require `ENVHQ_TOKEN`. Non-secret `url` stays in
  `~/.envhq/config.json`.
- **Expiry:** `api_tokens.expires_at`; server returns distinct `401
  token_expired`. On expiry, `push`/`pull` **auto-launch the browser flow and
  retry**.
- Keep `--token` / `ENVHQ_TOKEN` PAT path for CI.
- **Future tier:** sender-constrained (DPoP) tokens so a copied token is useless
  without the device key.

**Build surface:** server (`expires_at` + short-lived `cli_auth_requests` table +
code-exchange endpoint), web (`/cli/authorize` approve page), CLI (loopback+PKCE
`login`, `@napi-rs/keyring`, env-var source, auto-relogin interceptor).

## 8. Team handling

**Decision:** org-owned projects; Clerk Organizations for membership + invites;
project-level grants (env-scope designed-in); groups from the start.

- **Ownership:** projects belong to an **org**; every user has a default
  **personal org** (v1 projects migrate into it).
- **Membership + invites:** **Clerk Organizations** (email invites, org roles
  owner/admin/member). We build only resource access.
- **Access grants (our DB):** `access_grants(org_id, project_id, subject_type
  user|group, subject_id, role viewer|editor|admin, env_scope nullable)`.
  Project-level enforced first; `env_scope` (e.g. read-only prod) phased.
- **Groups:** `groups` (org-scoped) + `group_members`; grants target user or
  group. Effective access = union of direct + group grants, highest role wins.
- **Access layer:** `getAccessibleProject(userId, project, requiredRole)` resolves
  Clerk org membership (owner/admin ⇒ full) + direct + group grants + role
  hierarchy + env scope. Touches every route.
- **Roles:** Viewer (read values) / Editor (read+write, manage keys) / Admin
  (manage access, delete).

**Flags:** verify Clerk Organizations limits/pricing for expected scale; this is a
foundational epic (access-layer refactor is the bulk). Under ZK (§6), granting
also re-wraps the project key to the invitee — additive, doesn't change the ACL
model.

---

## UX / polish track

**Shipped:**
- Proper design tokens (shadcn palette was missing) — neutral base + **emerald
  brand accent**, light + dark.
- Theme switcher, **default light** (`next-themes`).
- **Brand identity**: EnvHQ logo (sync glyph + wordmark), branded landing.
- Web project-create auto-creates a `dev` env.
- Env editor: multiline / auto-growing value fields + word-wrap on reveal.
- Toasts positioned **top-center**.

**Backlog:** continued visual polish toward the branded identity (accent already
in place, easy to change — it's one token in `globals.css`); general UX passes.
