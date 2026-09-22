import { describe, it, expect } from "vitest";
import {
  poolOptions,
  DEFAULT_POOL_MAX,
  IDLE_TIMEOUT_SECONDS,
  CONNECT_TIMEOUT_SECONDS,
  APPLICATION_NAME,
} from "./pool";

describe("poolOptions", () => {
  it("rations connections to what one request needs", () => {
    // Not postgres-js's own 10: on Vercel the database sees instances x max,
    // so the per-instance number is the one that has to be small.
    expect(poolOptions({}).max).toBe(DEFAULT_POOL_MAX);
    expect(DEFAULT_POOL_MAX).toBeLessThan(10);
  });

  it("lets an operator raise the pool once a pooler is absorbing it", () => {
    // The measured table in pool.ts says a bigger pool is genuinely faster
    // per instance. Moving DATABASE_URL to a pooled endpoint is what makes
    // that affordable, and this is the knob to turn at the same time.
    expect(poolOptions({ DATABASE_POOL_MAX: "10" }).max).toBe(10);
  });

  it.each(["0", "-1", "abc", "2.5", ""])("falls back rather than honour DATABASE_POOL_MAX=%j", (raw) => {
    // A zero-sized pool deadlocks on the first query and a fractional one is
    // a typo; neither should be quietly obeyed.
    expect(poolOptions({ DATABASE_POOL_MAX: raw }).max).toBe(DEFAULT_POOL_MAX);
  });

  it("keeps prepared statements on by default", () => {
    // Measured, not assumed: postgres-js survives a transaction-mode pooler
    // by retrying on FetchPreparedStatement, and leaving them on is the
    // fastest option both directly and behind a pooler that tracks them.
    // See the table in pool.ts.
    expect(poolOptions({}).prepare).toBe(true);
  });

  it.each([
    ["false", false],
    ["0", false],
  ])("lets DATABASE_PREPARE=%j turn them off", (raw, expected) => {
    // For the one measured case where they cost rather than save: a pooler
    // in transaction mode that does not track statements itself.
    expect(poolOptions({ DATABASE_PREPARE: raw }).prepare).toBe(expected);
  });

  it.each(["true", "1", "yes", ""])("keeps them on for DATABASE_PREPARE=%j", (raw) => {
    // Only an explicit false/0 disables. Anything else — including a typo —
    // leaves the driver default, which is correct everywhere.
    expect(poolOptions({ DATABASE_PREPARE: raw }).prepare).toBe(true);
  });

  it("reclaims idle connections and fails fast on a full pool", () => {
    // postgres-js defaults idle_timeout to null (never close) and
    // connect_timeout to 30s (outliving the function that is waiting).
    // Both defaults are wrong for serverless; neither is obvious from the
    // call site, which is why they are asserted here.
    const o = poolOptions({});
    expect(o.idle_timeout).toBe(IDLE_TIMEOUT_SECONDS);
    expect(o.connect_timeout).toBe(CONNECT_TIMEOUT_SECONDS);
  });

  it("names itself so an operator can find it in pg_stat_activity", () => {
    expect(poolOptions({}).connection).toMatchObject({ application_name: APPLICATION_NAME });
  });

  it("leaves ssl to the connection string unless a CA is supplied", () => {
    // postgres-js parses sslmode off the URL itself; setting `ssl` here would
    // override a string that deliberately says sslmode=disable.
    expect(poolOptions({}).ssl).toBeUndefined();
    expect(poolOptions({ DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----" }).ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });
});
