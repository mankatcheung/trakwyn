import { describe, it, expect } from 'vitest';
import { providerHttpError, summarizeProviderBody } from '#src/infrastructure/llm/providerError.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import { PROVIDER_ERROR_BODY_MAX_CHARS } from '#src/infrastructure/config/constants.js';

describe('providerHttpError', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'quota'],
    [429, 'rate_limited'],
    [400, 'bad_request'],
    [404, 'bad_request'],
    [500, 'unavailable'],
    [529, 'unavailable'],
  ])('classifies status %i as %s', (status, kind) => {
    const err = providerHttpError('Anthropic', status, '{}');
    expect(err).toBeInstanceOf(LlmProviderError);
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
    expect(err.code).toBe('AI_PROVIDER_ERROR');
  });

  it('puts user-facing copy plus the provider and status in the message, and the excerpt in detail', () => {
    const err = providerHttpError('LLM provider', 401, '{"error":"invalid key"}');
    expect(err.message).toBe(
      'The provider rejected this API key — check it in Settings and try again (LLM provider error 401)',
    );
    expect(err.detail).toBe('{"error":"invalid key"}');
  });

  it('truncates a long body — a custom base URL can answer with a whole page', () => {
    const page = `<html>${'x'.repeat(5000)}</html>`;
    const err = providerHttpError('LLM provider', 502, page);
    expect(err.detail!.length).toBeLessThan(PROVIDER_ERROR_BODY_MAX_CHARS + 2);
    expect(err.detail!.endsWith('…')).toBe(true);
    expect(err.message).not.toContain('xxxx');
  });

  it('records no detail when the body is empty', () => {
    const err = providerHttpError('Google AI', 503, '');
    expect(err.detail).toBeNull();
    expect(err.message).toMatch(/\(Google AI error 503\)$/);
  });
});

describe('summarizeProviderBody', () => {
  it('collapses whitespace so a stack trace becomes one line', () => {
    expect(summarizeProviderBody('Error:\n   at foo\n\n   at bar')).toBe('Error: at foo at bar');
  });
});
