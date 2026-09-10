import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import { LLM_PROVIDER } from '#src/use-cases/constants.js';

export const VALID_LLM_PROVIDERS: string[] = Object.values(LLM_PROVIDER);

export function assertValidLlmProvider(provider: string): void {
  if (!VALID_LLM_PROVIDERS.includes(provider)) {
    throw new ValidationError('Unsupported AI provider');
  }
}

/**
 * What a model id may look like. Real ids are things like `gpt-4o-mini`,
 * `claude-haiku-4-5`, `openai/gpt-4o-mini` (OpenRouter), `models/gemini-…`.
 * The Google provider interpolates the id into a URL path, so anything that
 * could climb or re-target it — `..`, `?`, `#`, whitespace, a scheme — is
 * refused here, where every model id enters the system.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export function assertValidLlmModelId(model: string): void {
  if (!MODEL_ID_PATTERN.test(model) || model.includes('..') || model.includes('//')) {
    throw new ValidationError('Model name contains characters that are not allowed');
  }
}

export function isValidLlmApiKeyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Shared by `SaveLlmApiKeyUseCase` and `TestLlmApiKeyUseCase` (JEF-247) —
 * both need the same "is this a real provider, and does it carry a
 * baseUrl/model the way its provider type requires" shape check before
 * doing anything with the key itself.
 */
export function assertValidLlmApiKeyShape(params: {
  provider: string;
  baseUrl: string | null;
  model: string | null;
}): void {
  assertValidLlmProvider(params.provider);
  if (params.model) assertValidLlmModelId(params.model);

  const isCustom = params.provider === LLM_PROVIDER.CUSTOM;
  if (isCustom) {
    if (!params.baseUrl) {
      throw new ValidationError('A base URL is required for a custom provider');
    }
    if (!isValidLlmApiKeyUrl(params.baseUrl)) {
      throw new ValidationError('Base URL must be a valid http(s) URL');
    }
    if (!params.model) {
      throw new ValidationError('A model is required for a custom provider');
    }
  } else if (params.baseUrl) {
    throw new ValidationError('A base URL can only be set for a custom provider');
  }
}
