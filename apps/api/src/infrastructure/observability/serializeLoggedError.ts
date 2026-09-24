/**
 * The one place that decides what an error is allowed to put in the logs.
 *
 * Logging an error used to mean logging every enumerable property it carried,
 * because that is what pino's default error serializer does. For a
 * `DrizzleQueryError` those properties are `query` and `params`, so a failed
 * lookup shipped the value it was looking up — an email address, say — to
 * Axiom and to Cloud Logging (JEF-348). Telemetry is a copy of the data held
 * by a third party on its own retention schedule, outside the erasure path
 * the schema is careful about: deleting the user does not delete the log.
 *
 * So the rule is an allow-list, not a deny-list. A new error type cannot leak
 * a new field by being new, and a field has to be named here to survive.
 * `name`/`type` and `code` keep the expected/unexpected split and any
 * log-based grouping working; `message` and `stack` keep a failure
 * diagnosable. The `cause` chain is given the same treatment rather than
 * being trusted or dropped.
 *
 * Applied at both entry points — `PinoLogger`, which every use case and
 * resolver logs through, and pino's own `err` serializer in `index.ts`, which
 * catches Fastify's internal logging and the uncaught/shutdown paths. Both
 * sit upstream of the stream, so the OTLP copy and the stdout copy are
 * serialized once, together.
 */

/** What is left of an error after serialization. */
export interface SerializedError {
  /** `err.name`, e.g. `NotFoundError`. */
  name: string;
  /**
   * The constructor name. Redundant with `name` for any error that sets one,
   * but pino's default serializer emitted `type` and not `name`, so existing
   * Axiom queries group by it.
   */
  type: string;
  message: string;
  /**
   * Always a string, empty when the value carried no stack: pino's own
   * serializer emits the field unconditionally, and Fastify's `serializers`
   * type requires it.
   */
  stack: string;
  code?: string | number;
  cause?: SerializedError;
}

interface ErrorShape {
  name?: unknown;
  type?: unknown;
  message: string;
  stack?: unknown;
  code?: unknown;
  cause?: unknown;
  constructor?: { name?: unknown };
}

/**
 * How deep a `cause` chain is followed. A cap rather than a cycle check:
 * cheaper, and no real chain is this long.
 */
const MAX_CAUSE_DEPTH = 5;

/**
 * Drizzle appends the bound parameters to the message itself — `Failed query:
 * select … where "User"."email" = $1\nparams: someone@example.com,1` — and the
 * message is repeated at the head of the stack, so dropping the `params`
 * property alone leaves the value in two other fields. The line is stripped
 * from both. The SQL above it stays: it has placeholders, not values, and it
 * is what makes the failure readable.
 */
const SQL_PARAMS_LINE = /^params:.*$/gm;

const REDACTED_PARAMS_LINE = 'params: [redacted]';

const NON_ERROR_NAME = 'NonError';

function redactQueryParams(text: string): string {
  return text.replace(SQL_PARAMS_LINE, REDACTED_PARAMS_LINE);
}

/**
 * Structural rather than `instanceof Error`, for two reasons: an error that
 * crossed a realm boundary (a worker, a bundled dependency with its own
 * `Error`) fails the instance check, and it makes this function idempotent —
 * running it over its own output returns that output unchanged, which matters
 * because `PinoLogger` serializes before handing pino a value that pino's
 * `err` serializer then sees again.
 */
function isErrorShaped(value: unknown): value is ErrorShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * Something that is not an error was logged as one. Describe its shape —
 * type, class, own key names — and none of its values, since whatever is in
 * them was never vetted for this.
 */
function describeNonError(value: unknown): string {
  if (value === null) return 'Non-Error value logged: null';
  if (typeof value !== 'object') return `Non-Error value logged: ${typeof value}`;
  if (Array.isArray(value)) return `Non-Error array logged with ${value.length} entries`;

  const keys = Object.keys(value);
  const className = typeof value.constructor?.name === 'string' ? value.constructor.name : 'Object';
  return keys.length > 0
    ? `Non-Error ${className} logged with keys: ${keys.join(', ')}`
    : `Non-Error ${className} logged with no own keys`;
}

export function serializeLoggedError(value: unknown, depth = 0): SerializedError {
  if (!isErrorShaped(value)) {
    return {
      name: NON_ERROR_NAME,
      type: NON_ERROR_NAME,
      message: describeNonError(value),
      stack: '',
    };
  }

  const name = typeof value.name === 'string' ? value.name : 'Error';
  // A plain object's constructor name is `Object`, which says nothing — and
  // this function's own output is a plain object, so reading `type` back off
  // it is what keeps a second pass idempotent.
  const className =
    typeof value.constructor?.name === 'string' && value.constructor.name !== 'Object'
      ? value.constructor.name
      : undefined;
  const type = className ?? (typeof value.type === 'string' ? value.type : name);
  const code = value.code;

  return {
    name,
    type,
    message: redactQueryParams(value.message),
    stack: typeof value.stack === 'string' ? redactQueryParams(value.stack) : '',
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    ...(value.cause !== undefined && depth < MAX_CAUSE_DEPTH
      ? { cause: serializeLoggedError(value.cause, depth + 1) }
      : {}),
  };
}

/**
 * What Fastify's `serializers.err` option is typed to return: an open record
 * that must carry `type`, `message` and `stack`.
 */
type PinoSerializedError = { [key: string]: unknown; type: string; message: string; stack: string };

/**
 * The same rule, in the shape pino's `err` serializer slot expects.
 *
 * The fields are spread onto that wider type here rather than giving
 * `SerializedError` an index signature: the point of the interface is that
 * the set of fields is closed, and an index signature would say the opposite.
 */
export function serializeLoggedErrorForPino(err: unknown): PinoSerializedError {
  const { type, message, stack, ...rest } = serializeLoggedError(err);
  return { type, message, stack, ...rest };
}
