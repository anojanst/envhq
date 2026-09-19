# EnvHQ — Performance Baseline

**Measured 2026-09-19** (RM-5). This is the number every Performance ticket is
measured against. Without it, "faster" is an opinion and a regression is
invisible.

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

## Server-side baseline

25 iterations per route, median and p95 of total wall time.

| Route | Queries | Clerk calls | Median | p95 |
|---|---|---|---|---|
| `dashboard` | **16** | **6** | 2.1 ms | 2.9 ms |
| `projects/[id]` (redirect hop) | 4 | 1 | 0.6 ms | 0.9 ms |
| `environments/[envId]` — 40 vars | 5 | 1 | 1.1 ms | 2.4 ms |
| `environments/[envId]` — 400 vars | 5 | 1 | 1.7 ms | 2.7 ms |
| `api/environments/[id]/export` — 400 vars | 4 | 1 | 1.4 ms | 2.9 ms |

## The finding: the dashboard scales linearly with org count

Measured directly, by running the same page data with 1 org and with 5:

| Orgs | Queries | Clerk calls |
|---|---|---|
| 1 | 3 | 2 |
| 5 | 15 | 6 |

**Each additional org costs 3 more queries and 1 more Clerk round-trip.**

The shape is `listAccessibleProjectsWithEnvsAcrossOrgs` running
`listAccessibleProjectsWithEnvs` once per org membership, and each of those
calling `getClerkOrgRole` (one Clerk call) plus two `access_grants` lookups and
one project list query. The dashboard's 16th query is the `personal_orgs` lookup
that precedes all of it.

Extrapolating the measured slope, a user in 20 orgs loads the dashboard with
**61 queries and 21 Clerk round-trips**, every one of the Clerk calls a network
hop to a third party on the request path, sequenced before anything renders.

This is the number RM-6 ("stop fanning out to Clerk on the request path") and
RM-7 ("make the dashboard one query instead of per-org fan-out") exist to move.
Both should cite the table above and re-run the harness to show the new slope.

### Two smaller findings

- **`projects/[id]` costs 4 queries and a Clerk call to render nothing.** It
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
