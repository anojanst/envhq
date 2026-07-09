/**
 * Shared `.env` parser + serializer.
 *
 * Used by both the web app (paste-a-blob feature) and the CLI (push/pull),
 * so the two clients always agree on how a `.env` file is interpreted.
 *
 * Supported syntax:
 *   - `KEY=value` and `export KEY=value`
 *   - `# comments` (full-line and inline, when preceded by whitespace)
 *   - single- and double-quoted values
 *   - escape sequences inside double quotes (\n \t \r \\ \")
 *   - multi-line quoted values (e.g. PEM private keys)
 *   - blank lines
 * On duplicate keys, the last occurrence wins.
 */

export interface EnvPair {
  key: string;
  value: string;
}

/** A syntactically valid env var key. */
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface QuotedResult {
  value: string;
  /** Whether the closing quote was found in the given buffer. */
  closed: boolean;
}

/**
 * Read a quoted value from `buffer` (which is everything *after* the opening
 * quote). Returns the decoded value and whether the closing quote was found.
 */
function readQuoted(buffer: string, quote: '"' | "'"): QuotedResult {
  let out = "";
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];

    // Escape handling only applies inside double quotes.
    if (quote === '"' && ch === "\\") {
      const next = buffer[i + 1];
      if (next === undefined) {
        out += "\\";
        continue;
      }
      switch (next) {
        case "n":
          out += "\n";
          break;
        case "t":
          out += "\t";
          break;
        case "r":
          out += "\r";
          break;
        case "\\":
          out += "\\";
          break;
        case '"':
          out += '"';
          break;
        default:
          out += next;
      }
      i++;
      continue;
    }

    if (ch === quote) {
      return { value: out, closed: true };
    }
    out += ch;
  }
  return { value: out, closed: false };
}

/** Strip an inline `# comment` from an unquoted value (must follow whitespace). */
function stripInlineComment(value: string): string {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "#" && (i === 0 || /\s/.test(value[i - 1]!))) {
      return value.slice(0, i);
    }
  }
  return value;
}

/**
 * Parse a `.env` blob into an ordered list of key/value pairs.
 * Duplicate keys collapse to their last value while keeping first position.
 */
export function parseEnv(input: string): EnvPair[] {
  const ordered: EnvPair[] = [];
  const indexByKey = new Map<string, number>();

  const lines = input.replace(/\r\n?/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const withoutExport = raw.replace(/^\s*export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!KEY_RE.test(key)) continue;

    const rawValue = withoutExport.slice(eq + 1);
    const leading = rawValue.replace(/^[ \t]+/, "");
    const first = leading[0];

    let value: string;
    if (first === '"' || first === "'") {
      const quote = first as '"' | "'";
      const afterQuote = leading.slice(1);
      const single = readQuoted(afterQuote, quote);
      if (single.closed) {
        value = single.value;
      } else {
        // Value spans multiple lines — keep consuming until the quote closes.
        let buffer = afterQuote;
        let closed = false;
        while (i + 1 < lines.length) {
          i++;
          buffer += "\n" + lines[i]!;
          const attempt = readQuoted(buffer, quote);
          if (attempt.closed) {
            value = attempt.value;
            closed = true;
            break;
          }
        }
        if (!closed) {
          // Unterminated quote: best-effort, take what we have.
          value = readQuoted(buffer, quote).value;
        } else {
          value = value!;
        }
      }
    } else {
      value = stripInlineComment(rawValue).trim();
    }

    const existing = indexByKey.get(key);
    if (existing !== undefined) {
      ordered[existing]!.value = value;
    } else {
      indexByKey.set(key, ordered.length);
      ordered.push({ key, value });
    }
  }

  return ordered;
}

/** Quote/escape a single value for `.env` output when it needs it. */
function formatValue(value: string): string {
  if (value === "") return "";
  if (/[\s#="'\\]/.test(value)) {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  }
  return value;
}

/** Serialize pairs back into a `.env` blob (trailing newline included). */
export function serializeEnv(pairs: EnvPair[]): string {
  if (pairs.length === 0) return "";
  return pairs.map(({ key, value }) => `${key}=${formatValue(value)}`).join("\n") + "\n";
}

/** Convenience: pairs -> plain record (last key wins). */
export function pairsToRecord(pairs: EnvPair[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, value } of pairs) record[key] = value;
  return record;
}

/** Convenience: plain record -> pairs. */
export function recordToPairs(record: Record<string, string>): EnvPair[] {
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}
