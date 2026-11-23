# EnvHQ — Performance Baseline

**Measured 2026-09-19** (RM-5), **re-measured after RM-6 and RM-7**. This is the number
every Performance ticket is measured against. Without it, "faster" is an
opinion and a regression is invisible.

Refresh it with:

```bash
TEST_DATABASE_URL=postgres://envhq_test:envhq_test@localhost:5432/envhq_test \
  pnpm --filter @envhq/web test:perf
```

## Read this before citing a number

Not every figure here has the same standing, and treating them as equivalent
would be worse than having no baseline at all.

| Figure | How solid | Why |
|---|---|---|
| **Query counts** | Exact | From drizzle's `logger` hook, which fires once per executed query. Verified stable across 25 runs per route. |
| **Clerk call counts** | Exact | The instrumentation records the call whether the transport is real or stubbed. |
| **DB timings** | Real, but a floor | Local Postgres over a socket. Neon over the network will be slower. Useful as a *relative* measure between routes and before/after a change — not as an absolute target. |
| **Clerk latency** | **Not measured here** | The harness stubs Clerk, so its calls return from a Map in microseconds. Real latency comes from production `[perf]` logs (below). Treat the `clerkMs` of 0 as "not measured", never as "free". |
| **p75 LCP / INP / TTFB** | **Not available yet** | These are real-user percentiles. The deployment is live but single-user, so there is no distribution to take a p75 of. Speed Insights is wired and collecting; revisit when there is traffic. |

The sample: **5 orgs · 40 projects · 160 environments · 6,760 variables**, with
one deliberately large environment of 400 variables. RM-5's gotcha is why —
"a two-project account will look fine and tell you nothing."

Measured with the caller as an org **member** with explicit grants, not an org
admin. Admins short-circuit to "all projects" and skip the `access_grants` join,
which is the cheaper path; measuring the granted path keeps this honest.

> **Connection pooling is measured separately.** The numbers here are per
> request — queries, Clerk calls, milliseconds. How many database connections
> those requests are collectively allowed to open, and what happens when
> demand exceeds the pool, is RM-8's territory: see
> [OPERATIONS.md](./OPERATIONS.md). Its load test
> (`test-support/perf/connections.test.ts`) runs in this same `perf` project.

## Server-side baseline

25 iterations per route, median and p95 of total wall time.

| Route | Queries | Clerk calls | Median | p95 |
|---|---|---|---|---|
| `dashboard` | **2** (was 16) | **1** (was 6) | 1.4 ms | 1.8 ms |
| `projects/[id]` (redirect hop) | 4 | 1 | 0.6 ms | 1.3 ms |
| `environments/[envId]` — 40 vars | 5 | 1 | 1.3 ms | 2.2 ms |
| `environments/[envId]` — 400 vars | 5 | 1 | 1.8 ms | 2.4 ms |
| `api/environments/[id]/export` — 400 vars | 4 | 1 | 1.6 ms | 2.3 ms |

## The finding: the dashboard scales linearly with org count

Measured directly, by running the same page data with 1 org and with 5:

| Orgs | Queries (RM-5) | Queries (now) | Clerk calls (RM-5) | Clerk calls (now) |
|---|---|---|---|---|
| 1 | 3 | 1 | 2 | 1 |
| 5 | 15 | 1 | 6 | 1 |

**Neither cost grows with org count any more.** RM-6 removed the Clerk half,
RM-7 the query half. The slope is measured, not assumed, and the harness now
asserts both are zero — if either starts growing again, a fan-out is back.

The old shape was `listAccessibleProjectsWithEnvsAcrossOrgs` running
`listAccessibleProjectsWithEnvs` once per org membership, each of those doing
two `access_grants` lookups and one project list query, and each *also*
re-fetching the caller's whole membership list from Clerk to decide their role
in that org.

Both are gone. The role now comes from the membership list the page already
fetched (RM-6), and the per-org queries became one query whose visibility
predicate covers every org at once (RM-7). What remains is one `personal_orgs`
lookup plus one projects-with-environments query.

A user in 20 orgs now loads the dashboard with **2 queries and 1 Clerk
round-trip**, against the 61 queries and 21 Clerk calls the RM-5 baseline
projected.

## What RM-6 and RM-7 changed

| Path | RM-5 baseline | Now |
|---|---|---|
| Dashboard, 5 orgs | 16 queries, 6 Clerk calls | **2 queries, 1 Clerk call** |
| Dashboard, 20 orgs (extrapolated) | 61 queries, 21 Clerk calls | **2 queries, 1 Clerk call** |
| Version history, 50 distinct authors | 50 Clerk calls | **0** |

Three mechanisms, and they are not the same kind of thing:

- **The per-org loop is gone** (RM-7). The caller's orgs are split by role —
  admin orgs contribute every project, the rest contribute only projects the
  caller holds a grant on — and both halves carry their own `projects.orgId`
  restriction. Postgres flattens the grant check into a hash semi-join rather
  than re-running it per project. With no loop left, the per-org Clerk role
  lookup has nowhere to happen either.
- **Org membership is read once per request** (RM-6). `getClerkOrgRole` and
  `listMyOrgs` are both views over one `fetchMemberships`, wrapped in React's
  request-scoped `cache()`. Deliberately not a cross-request TTL: membership is
  an authorization input, and a revoked admin staying admin for the length of a
  TTL is a real access consequence.
- **Display names come from the local `user_profiles` mirror** (RM-6),
  refreshed by Clerk webhooks with a batched lazy fill. Fifty unknown authors
  cost one `getUserList` call (Clerk takes 100 ids per call), and zero on every
  later render.

RM-6 originally removed the fan-out by passing each org's already-known role
down into the per-org query. RM-7 deleted that path entirely, so the parameter
went with it — worth knowing if you go looking for it in the history.

The 50-author figure is asserted in `contract/user-profiles.test.ts`, which
counts calls at the fake Clerk boundary rather than inferring them.

### The index RM-7 needed

The new shape asks `access_grants` a question the old indexes could not answer:
"which grants does this caller hold?". The unique index leads with `project_id`,
so a subject-only probe cannot use it.

Measured on 6,000 projects and ~6,000 grants:

| | Plan for the grant lookup | Buffers | Node cost |
|---|---|---|---|
| Before | Seq Scan — 6,064 rows read to find 21 | 94 | 200 |
| After | Bitmap Index Scan on `access_grants_subject_idx` | 7 | 60 |

The buffer count is not the point. **A sequential scan here grows with the
grant count of the whole installation**, so without the index one customer's
dashboard would get slower every time an unrelated customer created a project.
The index scan grows only with that caller's own grants.

### Two smaller findings

- **`projects/[id]` still costs 4 queries and a Clerk call to render nothing.** It
  resolves access, looks up the first environment, and redirects to it. Anyone
  opening a project pays this before the page they actually wanted starts.
- **The environment editor does not N+1 on variables.** 40 variables and 400
  variables both cost exactly 5 queries; only the row-transfer time differs
  (0.2 ms vs 1.0 ms locally). So RM-9's "fast with hundreds of variables" is a
  client-side rendering problem, not a query problem — worth knowing before
  anyone optimises the wrong layer.

## Real-user metrics

`@vercel/speed-insights` and `@vercel/analytics` are mounted in
[`app/layout.tsx`](../apps/web/src/app/layout.tsx). They are no-ops off Vercel
and collect route paths, not environment contents.

**Still to do, and it needs the Vercel dashboard rather than a commit:** enable
Speed Insights and Web Analytics on the project. Until then nothing is collected
regardless of what the code does. With a single user, treat anything it reports
as directional — one person on one network is not a p75.

## Clerk latency in production

Once deployed, every measured route emits one line per request:

```
[perf] {"route":"dashboard","totalMs":412.7,"dbQueries":16,"clerkCalls":6,"clerkMs":288.1,...}
```

Filter Vercel's logs for `[perf]` and aggregate by `route` to get the real
distribution, and the real Clerk share of it. That is the number that turns the
"6 Clerk calls" above from a count into a cost.

The log line carries counts and durations only — never SQL, parameters,
variable names or values. See the invariant at the top of
[`lib/perf.ts`](../apps/web/src/lib/perf.ts).

## The environment editor (RM-9)

Measured with `pnpm --filter @envhq/web test` (the `ui` project), which mounts
the real editor over a real DEK and real ciphertext and records React's own
commit timings. **These are happy-dom numbers, not browser numbers** — a real
DOM is considerably faster. The ratios are the durable result; the absolute
milliseconds are environment-bound and are here to be compared against each
other, not quoted.

| | Before | After |
|---|---|---|
| One keystroke in the search box, 500 vars | 53.3 ms | **1.4 ms** |
| Same keystroke, 10 vars | 5.2 ms | 1.8 ms |
| Keystroke cost, 500 vs 10 | **10.3×** | **0.8× — flat** |
| Mount (page load → usable editor), 500 vars | 451 ms | **368 ms** |
| Commits during mount | 2 (347 ms + 105 ms) | **1** |
| Values decrypted on load | 500 | **0** |

### What the profile actually found

Decryption was the suspect and was not the culprit. 500 values decrypt in
**3.4 ms** total — 6.7 µs each, measured against the real `@envhq/crypto`.
That is under 1% of mount, so the ticket's "decrypt off the main thread"
option would have moved the DEK across a worker boundary — a real security
question, per the ticket's own gotcha — to save a single frame, once.

The cost was re-rendering. Every keystroke in the search box re-rendered the
parent, and every row with it, because each row was handed freshly-created
callbacks. Two changes:

- **`VarRow` is memoised behind `useCallback`-stable handlers.** The id and
  value travel as arguments rather than being closed over, which is what lets
  those handlers have empty dependency lists.
- **Decryption is lazy.** Values are masked until revealed, so decrypting all
  500 up front produced a second full-table commit — 105 ms spent updating
  text that was not on screen. Reveal, copy and edit each pull the one value
  they need. This changes *when* the crypto runs, not what it does (ADR-002).

### Why the list is not virtualised

The ticket offers virtualisation "if the profile says rendering — not crypto —
is the cost". It is, so the option was taken seriously and measured. Mount is
linear in row count, with no cliff:

| Rows | 100 | 250 | 500 | 1000 | 2000 |
|---|---|---|---|---|---|
| Mount | 109 ms | 168 ms | 275 ms | 574 ms | 1189 ms |
| Per row | 1.09 ms | 0.67 ms | 0.55 ms | 0.57 ms | 0.60 ms |

At the size the ticket names — hundreds — the fix above is enough, and the
remaining cost is the unavoidable one of putting those rows on screen.
Virtualising a table of variable-height rows would cost a dependency, spacer
row markup, in-page browser find (Cmd+F stops finding keys that aren't
rendered), and more accessibility surface — against roughly a tenth of a
second at the target size.

**The trigger to revisit**: environments routinely past ~1,000 variables, or
the keystroke ratio above drifting off flat. The curve is linear, so a
thousand variables is about double the current cost and two thousand about
quadruple; there is no point before that where this decision changes
suddenly.

## 2026-11-23 — org roles moved to Postgres (self-hosting phase 2)

`lib/orgs.ts` no longer calls Clerk: every membership and role read is one
Postgres query (`org_members` joined to `orgs`). The "Clerk calls" column
above therefore overstates today's cost for every route that resolves an org
role — those reads are now 0 Clerk calls and +1 query. The harness asserts the
new shape (`dashboard` makes 0 Clerk calls); re-run `test:perf` and refresh
the table before the next Performance ticket relies on these numbers.
