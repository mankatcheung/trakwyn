import { describe, it, expect, beforeAll } from 'vitest';
import { ENV } from '#src/infrastructure/config/constants.js';

describe('buildContainer', () => {
  beforeAll(() => {
    // client.ts constructs the real libSQL client at module-evaluation
    // time, so these must be set before container.js is imported below.
    process.env[ENV.DATABASE_URL] ??= 'file:container-test.db';
    process.env[ENV.JWT_SECRET] ??= 'test-secret';
    process.env[ENV.JWT_REFRESH_SECRET] ??= 'test-refresh-secret';
  });

  it('builds a container whose tokenService resolves to a JwtTokenService', async () => {
    const { buildContainer } = await import('#src/http/container.js');
    const { JwtTokenService } = await import('#src/infrastructure/auth/JwtTokenService.js');

    const container = buildContainer();

    expect(container.resolve('tokenService')).toBeInstanceOf(JwtTokenService);
  }, 15_000);

  it('resolves the offer use cases and resolver through proxy injection', async () => {
    const { buildContainer } = await import('#src/http/container.js');

    const container = buildContainer();

    expect(container.resolve('createOfferUseCase')).toBeDefined();
    expect(container.resolve('updateOfferUseCase')).toBeDefined();
    expect(container.resolve('deleteOfferUseCase')).toBeDefined();
    expect(container.resolve('getOffersUseCase')).toBeDefined();
    expect(container.resolve('compareOffersUseCase')).toBeDefined();
    expect(container.resolve('offerResolver')).toBeDefined();
  });
  it('resolves the generators with their new application-context deps (JEF-205)', async () => {
    const { buildContainer } = await import('#src/http/container.js');

    const container = buildContainer();

    // Awilix supplies noteRepository and companyBriefingRepository by name.
    // A missing registration would only surface the first time someone
    // generated a cover letter in production.
    expect(container.resolve('generateCoverLetterUseCase')).toBeDefined();
    expect(container.resolve('generateResumeUseCase')).toBeDefined();
    expect(container.resolve('generateCoverLetterDraftUseCase')).toBeDefined();
    expect(container.resolve('generateResumeDraftUseCase')).toBeDefined();
  });
  it('resolves the outbound URL policy and the factories that take it (S1)', async () => {
    const { buildContainer } = await import('#src/http/container.js');
    const { OutboundUrlPolicy } = await import('#src/infrastructure/net/OutboundUrlPolicy.js');

    const container = buildContainer();

    // Registered with asFunction: asClass would proxy-inject the cradle as
    // the options object and fail resolving `strict` as a dependency — which
    // is exactly what the chat-stream integration test caught.
    expect(container.resolve('outboundUrlPolicy')).toBeInstanceOf(OutboundUrlPolicy);
    expect(container.resolve('userLlmProviderFactory')).toBeDefined();
    expect(container.resolve('jobPostingSourceResolver')).toBeDefined();
    expect(container.resolve('saveLlmApiKeyUseCase')).toBeDefined();
    expect(container.resolve('testLlmApiKeyUseCase')).toBeDefined();
  });
});
