import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped performance measurement (RM-5). Establishes the baseline the
 * Performance workstream optimises against — without it, "faster" is an opinion
 * and a regression is invisible.
 *
 * INVARIANT: this module records counts and durations only. It must never log
 * SQL text, query parameters, variable names or values. Parameters carry
 * ciphertext and variable names, and names are unencrypted metadata (ADR-012) —
 * shipping them to a log drain would create a new exposure out of a measurement
 * change. `countQuery()` deliberately takes no arguments so there is nothing to
 * leak by accident.
 *
 * Server-only: `node:async_hooks` has no browser equivalent. Never import this
 * from a client component.
 *
 * Nothing here changes behaviour. Every helper is a pass-through when no span is
 * active, so an instrumented function called outside a measured route (a script,
 * a test, the CLI-facing API) behaves exactly as it did before.
 */

export interface ClerkCall {
  op: string;
  ms: number;
}

export interface DbSpan {
  label: string;
  ms: number;
}

export interface PerfSpan {
  route: string;
  /** Total wall time for the measured entry point. */
  totalMs: number;
  /** Every query drizzle executed inside this span — the count only. */
  dbQueries: number;
  /** Third-party calls to Clerk on the request path, timed individually. */
  clerk: ClerkCall[];
  /** Named units of database work, e.g. the dashboard's cross-org project read. */
  db: DbSpan[];
}

const storage = new AsyncLocalStorage<PerfSpan>();

/** The span for the request currently being measured, if any. */
export function currentSpan(): PerfSpan | undefined {
  return storage.getStore();
}

/** Total milliseconds spent waiting on Clerk in a span. */
export function clerkMs(span: PerfSpan): number {
  return span.clerk.reduce((sum, c) => sum + c.ms, 0);
}

/**
 * Counts one executed query. Wired to drizzle's `logger` hook in
 * `src/db/index.ts`, which fires for every query the postgres-js driver runs.
 * No-op outside a measured span.
 */
export function countQuery(): void {
  const span = storage.getStore();
  if (span) span.dbQueries += 1;
}

/**
 * Times a call to Clerk. These are network round-trips to a third party sitting
 * on the request path, so RM-5 wants them counted and timed separately from
 * database work rather than buried in a single "server time" number.
 */
export async function timeClerk<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const span = storage.getStore();
  if (!span) return fn();

  const started = performance.now();
  try {
    return await fn();
  } finally {
    // Recorded in `finally` so a failed Clerk call still shows the latency it
    // cost — a slow failure is exactly the case worth seeing.
    span.clerk.push({ op, ms: performance.now() - started });
  }
}

/** Times a named unit of database work (the handlers RM-5 calls out by name). */
export async function timeDb<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const span = storage.getStore();
  if (!span) return fn();

  const started = performance.now();
  try {
    return await fn();
  } finally {
    span.db.push({ label, ms: performance.now() - started });
  }
}

/**
 * Runs `fn` inside a fresh span and hands back both the result and the
 * measurements. Used by the perf harness, which reads the numbers directly
 * rather than parsing them back out of log lines.
 */
export async function measure<T>(
  route: string,
  fn: () => Promise<T>,
): Promise<{ result: T; span: PerfSpan }> {
  const span: PerfSpan = { route, totalMs: 0, dbQueries: 0, clerk: [], db: [] };
  const started = performance.now();
  try {
    const result = await storage.run(span, fn);
    return { result, span };
  } finally {
    // `finally`, not a straight-line assignment: Next's `redirect()` and
    // `notFound()` signal by throwing, so a page that always redirects (the
    // project page does) would otherwise record nothing at all — and a route
    // that throws is exactly one worth having a number for.
    span.totalMs = performance.now() - started;
  }
}

/**
 * Wraps a measured entry point: runs it inside a span and emits one structured
 * line when it finishes. This is what produces production numbers once deployed —
 * the local harness uses `measure` instead.
 *
 * Deliberately one line per request, not one per query: enough to compute a
 * distribution per route, cheap enough to leave on.
 */
export async function withPerf<T>(route: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled()) return fn();

  const span: PerfSpan = { route, totalMs: 0, dbQueries: 0, clerk: [], db: [] };
  const started = performance.now();
  try {
    return await storage.run(span, fn);
  } finally {
    // Emitted even when `fn` throws — see the note in `measure`. A redirect
    // costs a round trip whether or not it renders anything.
    span.totalMs = performance.now() - started;
    emit(span);
  }
}

function enabled(): boolean {
  // Off in tests so suite output stays readable; the harness calls `measure`
  // directly and doesn't depend on this. `ENVHQ_PERF_LOG=0` opts out elsewhere.
  if (process.env.NODE_ENV === "test") return false;
  return process.env.ENVHQ_PERF_LOG !== "0";
}

function emit(span: PerfSpan): void {
  const line = {
    route: span.route,
    totalMs: round(span.totalMs),
    dbQueries: span.dbQueries,
    clerkCalls: span.clerk.length,
    clerkMs: round(clerkMs(span)),
    db: span.db.map((d) => ({ label: d.label, ms: round(d.ms) })),
    clerk: span.clerk.map((c) => ({ op: c.op, ms: round(c.ms) })),
  };
  // Structured single line, greppable as `[perf]` in Vercel's log drain.
  console.info(`[perf] ${JSON.stringify(line)}`);
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
