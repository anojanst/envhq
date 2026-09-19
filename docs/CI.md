# EnvHQ — CI gates

**What CI enforces, why each gate exists, and how to change one honestly.**
Written for RM-4; update it when a gate moves.

Everything below runs from [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
on every push to `main` and every pull request, except the dependency audit,
which runs weekly from [`audit.yml`](../.github/workflows/audit.yml).

## The gates

| Gate | Job | What it catches |
|---|---|---|
| `lint` | web | ESLint, including the Next rules. |
| `build` | web | A broken production build. Also generates `.next/types`, which the typecheck needs. |
| `typecheck` | web, cli, packages | Type errors anywhere in the tsconfig, including files nothing imports. |
| `test:coverage` | web | 165 tests across the `unit`, `authz-db` and `contract` projects, plus the coverage floor. |
| `test` | cli, packages | The `node --test` suites for the CLI, crypto and parser. |
| `audit` | weekly | New advisories against production dependencies. |

## Typecheck

Every package has a `typecheck` script; `pnpm typecheck` from the root fans out
to all four.

```bash
pnpm typecheck
```

Three things are worth knowing:

- **The web typecheck must run after `build`.** `next-env.d.ts` imports
  `./.next/types/routes.d.ts`, which only exists once a build has generated it,
  so `tsc --noEmit` cannot run against a clean checkout. CI orders the steps
  accordingly.
- **The web typecheck is defence in depth, not a new capability.** Next 16.3.5
  does type-check test files and unreferenced sources during `build`. Next
  16.2.10 — what `main` ran until RM-4 — did not: `tsc --noEmit` found two real
  errors in the authorization test files that CI had been passing over for as
  long as they existed. Which files a framework's build step happens to check
  is not a contract, so the check is now stated explicitly rather than inherited.
- **`crypto` and `parser` had never been typechecked.** Adding the script
  surfaced missing `@types/node` and `allowImportingTsExtensions` in both
  tsconfigs — configuration gaps, not code bugs, but they meant `tsc` could not
  have run there at all. Their tsconfigs now match the CLI's.

`.next/dev` is excluded from the web tsconfig. It holds dev-server-only
generated types that go stale as routes move, and a stale copy in a working
tree produces errors about routes that no longer exist.

## Coverage floor

Scoped to `apps/web/src/lib` — the authorization and key-management code. The
configuration and the measured numbers live in
[`vitest.config.mts`](../apps/web/vitest.config.mts).

```bash
TEST_DATABASE_URL=postgres://envhq_test:envhq_test@localhost:5432/envhq_test \
  pnpm --filter @envhq/web test:coverage
```

**The floor exists to catch deletions, not to be raised for its own sake.** That
is RM-4's own wording and it is the whole design intent. A coverage percentage
optimised as a target stops measuring anything. If a change lowers the number
for a good reason — deleting dead code, say — lower the floor and say why in the
commit. Do not add tests whose only purpose is to move it up.

`src/lib/access.ts` carries its own per-file floor on top of the global one.
This is not decoration: deleting `access-matrix.test.ts` moves the global line
number by 1.9 points (73.35% → 71.42%, against a 72% floor), which is close
enough to the floor to be luck. The same deletion moves `access.ts` from 100% to
89.55%, which is not close at all. The per-file floor is what actually makes the
"deleting a test file fails CI" guarantee hold.

Both acceptance checks were verified by doing them:

| Check | Result |
|---|---|
| Deliberate type error in an unreferenced file | `typecheck` exits 2 |
| `access-matrix.test.ts` deleted | tests still pass (147/147), coverage exits 1 on 3 global and 4 per-file thresholds |

The second row is the interesting one: **the test suite goes green when you
delete a test file.** Only the coverage gate notices.

## Dependency audit

Weekly, not per-push: a new advisory against an unchanged lockfile is news
whether or not anyone pushed that week, and re-auditing a static dependency tree
on every PR only adds latency.

The blocking step is scoped to production dependencies:

```bash
pnpm audit --prod --audit-level=high
```

The full tree is reported in the same run but does not block. This is a
deliberate split. Dev-only advisories — ESLint, the `shadcn` CLI,
`swagger-parser` and their transitives — are real but are not reachable by a
request, and there are enough of them, usually unfixable without upstream, that
gating on them would mean a permanently red scheduled job. A gate that is always
red is a gate everyone learns to ignore.

### What the first run found

Wiring this up is what surfaced the following, which is the entire argument for
the ticket:

- **Next.js 16.2.10 carried two *critical* unauthenticated RCE advisories**
  (patched in 16.3.3). Bumped to 16.3.5 here.
- **`shadcn` was a runtime dependency.** Nothing under `src/` imports it — it is
  a scaffolding CLI — but sitting in `dependencies` pulled `hono`,
  `@modelcontextprotocol/sdk` and `cosmiconfig` into the production tree, and so
  into every production audit. Moved to `devDependencies`.
- **`browserslist` ≤ 4.28.6** carried two high advisories, reaching us only via
  `next > styled-jsx > @babel/*`. Pinned forward with an override in
  [`pnpm-workspace.yaml`](../pnpm-workspace.yaml); remove it once the upstream
  chain ships a patched range.

Production dependencies went from **50 vulnerabilities (2 critical, 24 high) to
1 (1 moderate)**.

## Keeping CI fast

RM-4's third acceptance criterion is that CI time does not grow materially.

- No new jobs. Typecheck and coverage are steps inside the `web`, `cli` and
  `packages` jobs that already run `pnpm install`, so nothing pays for another
  checkout or install. The three jobs run in parallel.
- pnpm's store is cached by `actions/setup-node`.
- Next's compiler cache (`apps/web/.next/cache`) is cached on the lockfile plus
  the app sources, with a restore-key that seeds a changed build from the last
  one on the same lockfile.
- The audit runs on its own schedule and is not in the PR path.
- The `perf` vitest project stays excluded from `pnpm test` (see
  [PERF_BASELINE.md](./PERF_BASELINE.md)).

The added work is one `tsc --noEmit` per package and v8 coverage collection on a
suite that takes about 5 seconds.
