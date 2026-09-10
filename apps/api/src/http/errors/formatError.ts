import { GraphQLError } from 'graphql';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';

// Expected client-facing error codes — these are not logged as server errors.
const EXPECTED_ERROR_CODES: string[] = [
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.CONFLICT,
  ERROR_CODES.QUOTA_EXCEEDED,
  ERROR_CODES.UNAUTHORIZED,
  ERROR_CODES.FORBIDDEN,
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.AI_NOT_CONFIGURED,
  ERROR_CODES.AI_LIMIT_REACHED,
  ERROR_CODES.AI_PROVIDER_ERROR,
  ERROR_CODES.STEP_UP_REQUIRED,
  ERROR_CODES.USER_NOT_FOUND,
];

export function formatError(err: GraphQLError, logger: ILogger): GraphQLError {
  const original = err.originalError;
  if (!original) return err;

  // GraphQLErrors thrown intentionally in resolvers pass through unchanged
  if (original instanceof GraphQLError) return original;

  // Log unexpected infrastructure errors server-side. Through the injected
  // logger rather than a bare console.error — that bypassed Fastify's pino
  // instance entirely, so an unexpected error showed up as a raw, uncolored
  // object dump disconnected from the request that caused it instead of a
  // leveled, pretty-printed log line like everything else.
  const coded = (original as { code?: string }).code;
  if (!coded || !EXPECTED_ERROR_CODES.includes(coded)) {
    logger.error('[GraphQL error]', original);
  }

  const appError = fromCodedError(original);
  return new GraphQLError(appError.message, {
    extensions: {
      code: appError.code,
      statusCode: appError.statusCode,
    },
  });
}
