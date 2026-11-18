export function extractGqlError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ message?: string }> } }).response;
    return r?.errors?.[0]?.message ?? null;
  }
  return null;
}

/** Extracts the GraphQL `extensions.code` from a graphql-request error, e.g. `STEP_UP_REQUIRED` (JEF-44). */
export function extractGqlErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ extensions?: { code?: string } }> } })
      .response;
    return r?.errors?.[0]?.extensions?.code ?? null;
  }
  return null;
}
