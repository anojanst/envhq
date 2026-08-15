/**
 * True if `err` is a Postgres unique-violation (23505), whether it's the
 * raw driver error or wrapped in drizzle-orm's `DrizzleQueryError` (which
 * nests the real driver error at `.cause` rather than exposing `.code`
 * directly — confirmed against both the neon-http and node-postgres
 * drivers this app uses).
 */
export function isUniqueViolation(err: unknown): boolean {
  return errorCode(err) === "23505" || errorCode((err as { cause?: unknown } | null)?.cause) === "23505";
}

function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
