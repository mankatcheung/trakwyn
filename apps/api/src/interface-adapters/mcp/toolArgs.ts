/**
 * Narrowing for MCP tool arguments. They arrive straight off a JSON-RPC
 * payload as arbitrary JSON, so every field is checked here rather than
 * trusted: anything unusable becomes `undefined`, and the caller decides
 * whether that is a missing required argument or a field left unchanged.
 */

/** A JSON-RPC tool call's `arguments`; narrow per field with the helpers below. */
export type ToolArgs = Record<string, unknown>;

export function toStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Models emit dates as strings of varying quality. Anything that isn't a
 * real date becomes undefined rather than an Invalid Date, which would
 * otherwise reach the DB as NaN and be far harder to diagnose.
 */
export function toDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * A numeric field may show up as a number, a numeric string, or something
 * unusable. Coerce leniently and fall back to `undefined` for anything that
 * isn't a positive integer — the use case then applies its own default and
 * clamps to PAGINATION.MAX_LIMIT, so a bad value degrades to the default page
 * rather than erroring or being silently honoured.
 */
export function toPositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * A money amount: a finite, non-negative number or numeric string. Neither
 * a blank string nor `null` is zero — `Number('')` and `Number(null)` are
 * both 0, which would write a salary nobody asked for.
 */
export function toAmount(value: unknown): number | undefined {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim().length > 0) n = Number(value);
  else return undefined;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Only a value from `allowed` survives; anything else is left unchanged (`undefined`). */
export function toOneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
