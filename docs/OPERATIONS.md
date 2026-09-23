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

### Why 3 direct, and why 10 pooled

Measured through a real PgBouncer in transaction mode, 10 simulated
instances each with its own pool, 100 concurrent requests, 5 ms of hold time
per query. "Backends" is real Postgres connections, counted at Postgres.

**Direct, `max_connections` 100:**

| `max` | client conns | backends | wall | failed requests |
|---|---|---|---|---|
| 3 | 30 | 30 | 347 ms | 0 |
| 5 | 50 | 50 | 285 ms | 0 |
| 10 | 100 | 99 | 253 ms | **11** |
| 20 | 200 | 99 | 248 ms | **438 of 500** |

This is the whole reason the default is 3. It is not a performance
preference — at `max: 10` across ten instances the database runs out of
connections and starts refusing work, and at 20 most requests fail. The
`instances x max` arithmetic isn't theoretical; that is it happening.

**Through the pooler (server pool 64):**

| `max` | client conns | backends | wall | failed |
|---|---|---|---|---|
| 3 | 30 | 30 | 410 ms | 0 |
| 5 | 50 | 50 | 312 ms | 0 |
| 10 | 100 | **64** | 228 ms | 0 |
| 20 | 200 | **64** | 187 ms | 0 |

Two things change. Backends stop tracking the client pool — 200 client
connections still produce 64 backends, because capping them is what a pooler
is for — and **nothing fails at any setting**. That is what makes raising
this safe rather than merely faster.

### It is a ceiling, not an allocation

Worth stating because it decides whether this is a cost question. `max` caps
the pool; connections are opened on demand and released by `idle_timeout`.
Measured against the production configuration at `max: 10`:

| | backends open |
|---|---|
| Pool constructed | 0 |
| After one query | 1 |
| After 2 concurrent queries | 2 |
| After 10 concurrent queries | 10 |
| After the idle timeout | 0 |

So raising this costs nothing until there is concurrency to use it. Neon
bills compute time and storage, not connections — and what actually keeps a
compute from autosuspending is connections *lingering*, which is
`idle_timeout`, set here to 20s against postgres-js's default of `null`
(never close). That is the setting that protects the bill; `max` is not.

One caveat this repo cannot answer: on the pooled endpoint the client talks
to Neon's PgBouncer rather than the compute, so how promptly the compute
suspends depends on how Neon ages out its own server-side connections. Watch
compute active-time in the Neon console, not connection counts.

### What actually determines the right number

Pool size per instance is a function of **concurrent requests per instance**,
not of total traffic. A request issues at most 3 concurrent queries, so an
instance serving R concurrent requests wants roughly `3R` connections before
the pool stops being the limit.

Vercel answers load with more instances rather than more load per instance,
which is why this flattens out. Same pooler, same total traffic, 30
instances instead of 10:

| `max` | wall, 10 instances | wall, 30 instances |
|---|---|---|
| 3 | 410 ms | 190 ms |
| 10 | 228 ms | 167 ms |
| 20 | 187 ms | 170 ms |

At 30 instances the whole range from 3 to 20 is within noise. The setting
only matters when few instances are each carrying a lot — and past the
pooler's own server pool it stops mattering at all, because that is then the
constraint.

So **10 is the knee, not a maximum**: it captures most of the available gain
where the gain exists, and going further buys single-digit percentages
against a limit the pooler owns anyway. Raise it beyond 10 only with a
measurement of your own, and lower it only back towards 3 if you leave the
pooler.

This stays a decision you make rather than one inferred from the URL's
shape. Inferring it would mean a direct database that merely looked pooled
getting a pool three times too large — and the direct table above shows
exactly what that costs.

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

## Knowing when something is broken

Added by RM-18. Before it, a production failure was noticed when a customer
wrote in.

### Errors

Every uncaught error in any route or page reaches `lib/observability.ts`
through Next's `onRequestError` hook (`src/instrumentation.ts`), so a new
route cannot forget to report. Failures that are *caught* and turned into a
500 — the Clerk webhook handler, and Stripe's when it exists — call
`reportError` explicitly, because nothing else will see them.

Issues are grouped by a fingerprint of **route + error kind + top stack frame
location**, never the message. A message interpolating a project id would
otherwise make every project its own issue and alert on each one.

**Alerts fire on a new issue, and again only after it has been quiet for a
day.** The thousandth occurrence is silent; a regression that returns weeks
later is news again. Set `ALERT_WEBHOOK_URL` to any endpoint accepting
`{"text": "..."}` — a Slack incoming webhook, an incident tool, your own
relay. Unset, errors are still recorded and visible; nobody is told.

A known, accepted failure can be **muted** at `/ops`, which stops it alerting
permanently until a human unmutes it. This exists because the alternative to
muting one noisy issue is to stop reading alerts, and that takes the real
ones with it.

#### What is deliberately not recorded

The store is our own database, not a third-party tracker, and it holds far
less than one would:

| Kept | Not kept |
|---|---|
| Route *pattern* (`/api/projects/[id]`) | The resolved URL, which carries real ids |
| Error kind, scrubbed and truncated message | Request bodies, query parameters, headers |
| Occurrence counts, first/last seen, release | Stack traces (they stay in the platform log) |

Messages are scrubbed for the shapes a secret takes here — `envhq_` tokens,
connection strings, bearer credentials, and base64 runs of 24 characters or
more, which is every ciphertext, nonce, sealed DEK and public key in the
system. The scrubber over-redacts on purpose: losing a detail costs a slower
debugging session, and the other direction costs a customer's variable names
in a log drain. Variable names are unencrypted metadata (ADR-012), so they
are both the easiest thing to leak and genuinely useful to an attacker.

### Uptime

`GET /api/health` is what a monitor polls.

| Called | Answers |
|---|---|
| With no credential | 200 if the process is up and can reach Postgres; 503 if not |
| With `Authorization: Bearer <token>` | Additionally exercises the token lookup — 200 `auth: ok` |
| With a token that doesn't resolve | **401**, not 503 |

That last row is the one worth setting up deliberately. Point a monitor at
the authenticated form with a read-only PAT, because a shallow check keeps
reporting green through an auth failure while every customer is locked out.
But a rejected token means *the monitor's own credential* expired — a
misconfiguration on its side, not an outage — so it answers 401 and should
not page anyone. Configure the monitor to alarm on 5xx, and to treat 401 as
"go fix the monitor".

The endpoint deliberately reveals nothing beyond up/down. A health check
listing versions or dependency hostnames is free reconnaissance.

### EnvHQ's own numbers

`/ops` (and `GET /api/ops/metrics`) shows growth, usage and health counts.
Access is `ENVHQ_STAFF_USER_IDS`, a comma-separated allowlist of Clerk user
ids; unset or empty admits nobody. Org admin is deliberately not sufficient —
that means admin of a *customer's* org, and using it would show every
customer everyone else's aggregate numbers. A real staff role belongs to
RM-17's admin dashboard; this is a list in an environment variable precisely
so there is no half-built permissions model there to unpick. Non-staff get
404, not 403.

**What it cannot show, and why** — the page says this too, so nobody reads a
zero as a fact:

- **Failed logins.** Clerk owns authentication; a failed sign-in never
  reaches this app. Clerk's dashboard has them.
- **Subscriptions and Stripe webhook failures.** There is no billing in this
  codebase yet. When it arrives its webhook failures appear under "Recent
  issues" with no change here — they go through the same `reportError` path
  the Clerk webhook already uses.
- **Per-request pull counts.** Tokens and deploy keys record their *last*
  use, not every use, so "active in the last 24h" is answerable and a total
  is not. Counting every request means a write on the request path, which is
  a cost to take deliberately rather than by accident.

### Checking it actually works

Throw a deliberate error on a deployed environment and watch it arrive:

```bash
curl -s "$APP_URL/api/health" | jq          # expect ok: true
curl -s -H "Authorization: Bearer $PAT" "$APP_URL/api/health" | jq
```

Then visit `/ops` as a staff user. A permanently empty issue list on a live
system means the reporter is broken, not that nothing has failed — the page
says so where the list would be.
