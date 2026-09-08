import {
  AiNotConfiguredError,
  LLM_PROVIDER_FAILURE_MESSAGES,
  LlmProviderError,
  RateLimitedError,
  ServiceUnavailableError,
} from '#src/use-cases/errors/DomainError.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import { LLM, LLM_PROVIDER } from '#src/use-cases/constants.js';
import {
  assertValidLlmApiKeyShape,
  assertValidLlmProvider,
} from '#src/use-cases/user/llmApiKeyValidation.js';
import type {
  ITestLlmApiKeyUseCase,
  TestLlmApiKeyInput,
  TestLlmApiKeyResult,
} from '#src/use-cases/user/ITestLlmApiKeyUseCase.js';

interface Deps {
  llmProviderFactory: ILLMProviderFactory;
  testLlmApiKeyRateLimiter: IRateLimiter;
  outboundUrlPolicy: IOutboundUrlPolicy;
}

const TEST_MESSAGE = 'Reply with a single word to confirm this connection works.';

/**
 * "Does this key work" ping for Settings → AI (JEF-247) — a cheap
 * `complete()` call, never `completeWithToolsStream()` (removed from
 * `ILLMProvider` in JEF-245; there's no need to reintroduce a tool-calling
 * path just to validate a key).
 *
 * Two ways in, both ending at the same `complete()` call:
 * - `input.apiKey` given: the add-key form's unsaved values — build the
 *   provider directly via `ILLMProviderFactory.fromCredentials`, nothing is
 *   persisted.
 * - `input.apiKey` omitted: an already-saved key — resolve it through
 *   `ILLMProviderFactory.forUser`, the same decrypt-and-construct path
 *   automatic AI features use.
 *
 * Deliberately never throws for "the key doesn't work" — a bad key someone
 * is actively testing isn't a server error. `ok`/`error` reports that
 * outcome, with the error classified by `LlmProviderError.kind` rather than
 * quoted from the provider; thrown `DomainError`s stay reserved for genuine
 * failures — our own rate limit, an unrecognized provider id, a base URL the
 * outbound policy refuses, or no key on file to test at all.
 */
export class TestLlmApiKeyUseCase implements ITestLlmApiKeyUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: TestLlmApiKeyInput): Promise<TestLlmApiKeyResult> {
    if (!(await this.deps.testLlmApiKeyRateLimiter.consume(`testLlmApiKey:${input.userId}`))) {
      throw new RateLimitedError('Too many test attempts — please wait a moment and try again');
    }

    const trimmedKey = input.apiKey?.trim();
    const isCustom = input.provider === LLM_PROVIDER.CUSTOM;
    const baseUrl = input.baseUrl?.trim() || null;
    const model = input.model?.trim() || null;

    const provider = trimmedKey
      ? await this.resolveUnsavedProvider(input.provider, trimmedKey, isCustom, baseUrl, model)
      : await this.resolveSavedProvider(input.userId, input.provider);

    try {
      await provider.complete(
        [{ role: 'user', content: TEST_MESSAGE }],
        LLM.TEST_API_KEY_MAX_TOKENS,
      );
      return { ok: true };
    } catch (err) {
      // The provider's own words never reach the caller: for a custom base
      // URL the "provider" is whatever the user pointed us at, and echoing
      // its body made this mutation a way to read any HTTP service the API
      // host can reach. `LlmProviderError.message` is per-kind copy.
      const message =
        err instanceof LlmProviderError ? err.message : LLM_PROVIDER_FAILURE_MESSAGES.unreachable;
      return { ok: false, error: message };
    }
  }

  private async resolveUnsavedProvider(
    providerId: string,
    apiKey: string,
    isCustom: boolean,
    baseUrl: string | null,
    model: string | null,
  ) {
    assertValidLlmApiKeyShape({ provider: providerId, baseUrl, model });
    if (isCustom && baseUrl) {
      await this.deps.outboundUrlPolicy.assertAllowed(baseUrl, 'llm-provider');
    }
    // Shape is already validated, so a null return here would mean
    // VALID_LLM_PROVIDERS and the provider registry disagree — a
    // programmer error, not a user-facing "key doesn't work" case.
    const provider = this.deps.llmProviderFactory.fromCredentials({
      provider: providerId,
      apiKey,
      model,
      baseUrl: isCustom ? baseUrl : null,
    });
    if (!provider) {
      throw new ServiceUnavailableError(`No provider registered for '${providerId}'`);
    }
    return provider;
  }

  private async resolveSavedProvider(userId: string, providerId: string) {
    assertValidLlmProvider(providerId);
    // trackUsage: false — this is a connectivity check, not real usage; see
    // ILLMProviderFactory.forUser's doc comment (JEF-250).
    const provider = await this.deps.llmProviderFactory.forUser(
      userId,
      providerId,
      undefined,
      false,
    );
    if (!provider) {
      throw new AiNotConfiguredError('No API key saved for this provider yet');
    }
    return provider;
  }
}
