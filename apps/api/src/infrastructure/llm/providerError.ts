import { LlmProviderError, type LlmProviderErrorKind } from '#src/use-cases/errors/DomainError.js';
import { PROVIDER_ERROR_BODY_MAX_CHARS } from '#src/infrastructure/config/constants.js';

function kindForStatus(status: number): LlmProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'bad_request';
}

/**
 * One line of what the provider said: whitespace collapsed and cut at
 * `PROVIDER_ERROR_BODY_MAX_CHARS`. Provider error bodies are short JSON in
 * the normal case, but a custom base URL can answer with anything — a
 * login page, a stack trace, an internal service's whole response — and
 * whatever is kept here ends up in logs. Nothing here is ever sent back to
 * the client verbatim (see `TestLlmApiKeyUseCase`).
 */
export function summarizeProviderBody(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length > PROVIDER_ERROR_BODY_MAX_CHARS
    ? `${collapsed.slice(0, PROVIDER_ERROR_BODY_MAX_CHARS)}…`
    : collapsed;
}

/** A non-2xx response from a provider, as the coded error every AI use case propagates. */
export function providerHttpError(label: string, status: number, body: string): LlmProviderError {
  const excerpt = summarizeProviderBody(body);
  return new LlmProviderError(kindForStatus(status), {
    provider: label,
    status,
    detail: excerpt || null,
  });
}
