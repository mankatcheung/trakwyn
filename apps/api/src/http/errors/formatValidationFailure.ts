import { GraphQLError } from 'graphql';
import { EXTENSION_ORIGIN_SCHEMES, GRAPHQL_VALIDATION_ERROR_CODE } from '#src/http/constants.js';
import { parseTrakwynClientUserAgent } from '#src/infrastructure/device/trakwynClientUserAgent.js';
import type { GraphqlClientKind, IMetrics } from '#src/infrastructure/observability/metrics.js';
import { recordValidationFailure } from '#src/infrastructure/observability/recordValidationFailure.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

/** What of the request the log line needs; the body is never read past `operationName`. */
export interface ValidationFailureRequest {
  body?: unknown;
  headers: { 'user-agent'?: string; origin?: string };
}

const MAX_LOGGED_MESSAGES = 10;
const MAX_MESSAGE_LENGTH = 200;
const MAX_OPERATION_NAME_LENGTH = 128;
/** A GraphQL `Name` token. Anything else is not an operation name we could have shipped. */
const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

/** True for the error Mercurius throws when a document fails schema validation. */
export function isValidationFailure(err: GraphQLError): boolean {
  return (
    (err.originalError as { code?: string } | undefined)?.code === GRAPHQL_VALIDATION_ERROR_CODE
  );
}

/**
 * The `operationName` the client sent, only if it is shaped like a GraphQL
 * name. It comes straight from an unauthenticated request body, so it is
 * checked before it reaches a log line or a span attribute.
 */
function operationNameOf(body: unknown): string | undefined {
  const name = (body as { operationName?: unknown } | null | undefined)?.operationName;
  if (typeof name !== 'string') return undefined;
  if (name.length > MAX_OPERATION_NAME_LENGTH || !GRAPHQL_NAME.test(name)) return undefined;
  return name;
}

function clientOf(request: ValidationFailureRequest): {
  client: GraphqlClientKind;
  version?: string;
} {
  const mobile = parseTrakwynClientUserAgent(request.headers['user-agent']);
  if (mobile) return { client: 'mobile', version: mobile.version };

  const origin = request.headers.origin;
  if (origin && EXTENSION_ORIGIN_SCHEMES.some((scheme) => origin.startsWith(scheme))) {
    return { client: 'extension' };
  }
  return { client: 'other' };
}

/**
 * A document that fails validation is a client built against a schema this
 * API no longer has (JEF-417), not a server fault (JEF-472). So it is logged
 * at `warn` with what the schema said, counted per client and version, and
 * answered with each validation message as a `VALIDATION` error — the shape
 * Mercurius's own formatter gives, which `formatError` would otherwise have
 * replaced with "Internal server error".
 *
 * The messages name schema fields and types, and may quote a literal the
 * document wrote inline; Trakwyn's clients send values as variables, which
 * are never read here. Each message is clipped, and only the first few are
 * logged.
 */
export function formatValidationFailure(
  err: GraphQLError,
  request: ValidationFailureRequest,
  logger: ILogger,
  metrics: IMetrics,
): GraphQLError[] {
  const causes = (err.originalError as { errors?: readonly Error[] } | undefined)?.errors ?? [];
  const messages = causes.map((cause) => cause.message);
  const operationName = operationNameOf(request.body);
  const { client, version } = clientOf(request);

  logger.warn('[GraphQL validation failed]', undefined, {
    event: 'graphql.validation.failed',
    operationName,
    client,
    clientVersion: version,
    errorCount: messages.length,
    messages: messages
      .slice(0, MAX_LOGGED_MESSAGES)
      .map((message) => message.slice(0, MAX_MESSAGE_LENGTH))
      .join(' | '),
  });
  metrics.recordGraphqlValidationFailure(client, version);
  recordValidationFailure(operationName);

  const extensions = { code: ERROR_CODES.VALIDATION, statusCode: 400 };
  if (messages.length === 0) return [new GraphQLError(err.message, { extensions })];
  return messages.map((message) => new GraphQLError(message, { extensions }));
}
