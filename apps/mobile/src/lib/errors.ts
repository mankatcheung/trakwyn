import i18n from '../i18n';

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

/** Turns any thrown error (GraphQL, network, or otherwise) into a single user-facing message. */
export function getErrorMessage(error: unknown): string {
  if (isGraphQLErrorLike(error)) {
    const gqlError = error.response.errors?.[0];
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
