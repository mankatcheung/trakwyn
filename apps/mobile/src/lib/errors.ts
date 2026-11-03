import i18n from '../i18n';
import { ERROR_CODES } from '../constants';

interface GraphQLErrorLike {
  response: {
    errors?: { message?: string; extensions?: { code?: string } }[];
  };
}

// Duck-typed rather than `instanceof ClientError`, matching apps/web's
// approach: keeps this testable against plain mocked rejection shapes.
function isGraphQLErrorLike(error: unknown): error is GraphQLErrorLike {
  return typeof error === 'object' && error !== null && 'response' in error;
}

/** Resolved lazily (not a module-level constant) so it always reflects the current language. */
export function getNetworkMessage(): string {
  return i18n.t('common:errorNetwork');
}

const PLAN_REQUIRED_CODE = 'PLAN_REQUIRED';
const SENTENCE_END = /[.!?。！？]$/;

/**
 * A Pro feature is not a failure and there is nothing to retry. Billing lives
 * on the web (the app has no in-app purchase), so the message keeps what the
 * API said, which names the feature, and says where to go (JEF-344).
 */
function planRequiredMessage(apiMessage: string | undefined): string {
  const message = apiMessage ?? i18n.t('common:errorPlanRequiredDefault');
  const sentence = SENTENCE_END.test(message) ? message : `${message}.`;
  return i18n.t('common:errorPlanRequired', { message: sentence });
}

/**
 * The message for a code that arrives without a GraphQL error to read it from,
 * such as an SSE error frame. Null for codes the app has no copy for, so an
 * old build meeting a new code shows the frame's own message (JEF-451).
 */
export function codedErrorMessage(code: string): string | null {
  if (code === ERROR_CODES.EMAIL_NOT_VERIFIED) return i18n.t('common:errorEmailNotVerified');
  if (code === ERROR_CODES.AI_TEMPORARILY_UNAVAILABLE) return i18n.t('common:errorAiUnavailable');
  return null;
}

/** Turns any thrown error (GraphQL, network, or otherwise) into a single user-facing message. */
export function getErrorMessage(error: unknown): string {
  if (isGraphQLErrorLike(error)) {
    const gqlError = error.response.errors?.[0];
    if (gqlError?.extensions?.code === PLAN_REQUIRED_CODE) {
      return planRequiredMessage(gqlError.message);
    }
    if (gqlError?.extensions?.code === ERROR_CODES.AI_CREDITS_EXHAUSTED) {
      // The API's message names the reset date; an empty one still gets copy.
      return gqlError.message ?? i18n.t('common:errorAiCreditsExhausted');
    }
    if (gqlError?.extensions?.code === ERROR_CODES.EMAIL_NOT_VERIFIED) {
      return i18n.t('common:errorEmailNotVerified');
    }
    if (gqlError?.extensions?.code === ERROR_CODES.AI_TEMPORARILY_UNAVAILABLE) {
      return i18n.t('common:errorAiUnavailable');
    }
    return gqlError?.message ?? i18n.t('common:errorGeneric');
  }

  if (error instanceof TypeError) return getNetworkMessage();

  return i18n.t('common:errorGeneric');
}

/** The API's error code (`ERROR_CODES.*`) on a GraphQL error, or null for anything else — mirrors apps/web's extractGqlErrorCode. */
export function getErrorCode(error: unknown): string | null {
  if (!isGraphQLErrorLike(error)) return null;
  return error.response.errors?.[0]?.extensions?.code ?? null;
}
