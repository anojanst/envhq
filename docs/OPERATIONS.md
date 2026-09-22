# Operating EnvHQ

What an operator needs that the code can't state on its own: how many database
connections this app is allowed to open, what to change when that ceiling gets
close, and which responses may and may not be cached.

Established by RM-8. The measurements here were taken against Postgres 17 on a
local socket — good for comparing configurations against each other, not for
predicting absolute production latency. `docs/PERF_BASELINE.md` carries the
same caveat and the per-route numbers.

## The connection ceiling

**The number that matters is `instances × DATABASE_POOL_MAX`, not
`DATABASE_POOL_MAX`.**

On Vercel each concurrent invocation is its own instance with its own
connection pool. Nothing coordinates them. So a setting that reads like "this
app uses at most N connections" is really "each copy of this app uses at most
N", and the app has as many copies as it has concurrent traffic. This is how a
busy minute exhausts Postgres while every individual instance looks idle.

| | Value | Where |
|---|---|---|
| Connections per instance | **3** | `DEFAULT_POOL_MAX`, `apps/web/src/db/pool.ts` |
| Idle connection reclaimed after | 20 s | `IDLE_TIMEOUT_SECONDS`, same file |
| Give up waiting for a connection after | 10 s | `CONNECT_TIMEOUT_SECONDS`, same file |
| Our connections are named | `envhq-web` | `application_name`, visible in `pg_stat_activity` |

Three is what one request actually needs: the widest fan-out on any request
path is the environment editor's two parallel queries after the one it awaits
first. postgres-js's own default is 10, held forever (`idle_timeout: null`) —
ten instances of that is 100 connections, the entire `max_connections` of a
stock Postgres.

### What you're currently allowed

```
SHOW max_connections;                     -- the database's ceiling
SELECT count(*) FROM pg_stat_activity WHERE application_name = 'envhq-web';
```

Divide the first by 3 (leaving headroom for migrations, Drizzle Studio and
your own psql) to get the number of simultaneous instances the current
configuration supports. When real concurrency approaches that, the fix is the
next section — not a smaller pool, which only moves the failure from "out of
connections" to "every request queues".

### Moving to a pooled connection string

A transaction-mode pooler (Neon's pooled endpoint, PgBouncer, Supabase's
pooler) ends the arithmetic above: a client connection to the pooler is not a
Postgres backend, and it multiplexes many of them onto a few. Neon's accepts
10,000.

Two changes, together:

1. Point `DATABASE_URL` at the pooled endpoint — for Neon, the host with
   `-pooler` in it.
2. Raise `DATABASE_POOL_MAX` to `10`.

The second is not optional bookkeeping, it is the throughput you moved for. At
50 concurrent requests with 5 ms of hold time per query:

| `max` | wall clock |
|---|---|
| 1 | 4748 ms |
| 3 | 1854 ms |
| 10 | 852 ms |
| 20 | 464 ms |

A bigger pool is genuinely faster per instance. The only reason the default is
3 is that connections to an unpooled Postgres are a fixed, shared, small
supply. Once the pooler is absorbing them, take the throughput.

This is deliberately a decision you make, not one inferred from the URL's
shape. Inferring it would mean a direct database that merely looked pooled
getting a pool three times too large — the failure that takes the whole app
down rather than the one that makes it slow.

### Prepared statements

`DATABASE_PREPARE=false` turns off named prepared statements. **You almost
certainly do not need it.**

The usual advice is that prepared statements break behind a transaction-mode
pooler. Checked, rather than repeated: 400 queries, 20 clients multiplexed
over 5 backends through PgBouncer 1.25 in transaction mode with its own
statement tracking explicitly disabled — **zero errors**. postgres-js
recovers on its own, watching for the `FetchPreparedStatement` error routine,
dropping the cached statement and re-executing once.

So it is a cost, not a fault, and which way it goes depends on whether the
pooler tracks statements itself — which has been PgBouncer's default since
1.24. Median per query:

| Target | `prepare: true` | `prepare: false` |
|---|---|---|
| Direct connection | **0.025 ms** | 0.031 ms |
| PgBouncer txn, no statement tracking | 0.064 ms | **0.037 ms** |
| PgBouncer txn, tracking on (the default) | **0.023 ms** | 0.036 ms |

Leaving them on is fastest for both configurations you are likely to meet.
Set `DATABASE_PREPARE=false` only for the middle row — a pooler in
transaction mode that you know does not track prepared statements — and
confirm it helped before leaving it set.

### Re-running the load test

```bash
TEST_DATABASE_URL=postgres://envhq_test:envhq_test@localhost:5432/envhq_test \
  pnpm --filter @envhq/web test:perf
```

`src/test-support/perf/connections.test.ts` drives 50 concurrent requests
through the real production pool configuration and asserts the database never
sees more backends than the pool allows. It opens its own postgres-js client
on purpose: every other suite runs on node-postgres, which would measure a
different driver's pool.

## What may be cached

### Public pages: static, and must stay that way

`/`, `/terms` and every page under `/docs` are statically prerendered and
served from the CDN. Confirm after any change to them:

```bash
pnpm --filter @envhq/web build     # look for ○ (Static) beside each
```

The landing page is the fragile one. It previously called `auth()` to bounce
a signed-in visitor to the dashboard, and **a single session read is enough to
make an entire route render on demand** — so the one page every logged-out
visitor lands on was a function invocation. That redirect now lives in
`middleware.ts`, which runs before the cache and is the right layer for a
decision that depends on who is asking. If `/` ever shows as `ƒ (Dynamic)`
again, something on it started reading the session.

### Authenticated responses: never

Every route under `src/app/api` answers as the caller, so all of them send:

```
Cache-Control: private, no-store
```

`private` bars shared caches; `no-store` stops the browser keeping a copy on
disk. It comes from `json()` in `src/lib/api.ts`, and
`test-support/contract/helpers.ts` asserts it on every response the contract
suite sees — a new route that builds its own response and forgets fails on
its first test.

There is no per-user caching anywhere in the app, and adding one would need
more care than a header: a cache key that varies by user is a cache key you
can get wrong once and leak with.
