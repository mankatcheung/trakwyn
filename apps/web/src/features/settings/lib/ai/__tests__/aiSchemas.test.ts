import { describe, expect, it } from 'vitest';
import {
  CUSTOM_LLM_PROVIDER,
  MAX_AI_PROMPT_LENGTH,
  customAiPromptSchema,
  llmApiKeySchema,
} from '../aiSchemas';

function issues(input: unknown) {
  const result = llmApiKeySchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => [i.path.join('.'), i.message]);
}

describe('customAiPromptSchema', () => {
  it('accepts an empty prompt and one at the limit', () => {
    expect(customAiPromptSchema.safeParse({ customAiPrompt: '' }).success).toBe(true);
    expect(
      customAiPromptSchema.safeParse({ customAiPrompt: 'a'.repeat(MAX_AI_PROMPT_LENGTH) }).success,
    ).toBe(true);
  });

  it('rejects a prompt over the limit with a message naming it', () => {
    const result = customAiPromptSchema.safeParse({
      customAiPrompt: 'a'.repeat(MAX_AI_PROMPT_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `Must be ${MAX_AI_PROMPT_LENGTH} characters or fewer`,
    );
  });
});

describe('llmApiKeySchema', () => {
  it('accepts a built-in provider with a key', () => {
    expect(llmApiKeySchema.safeParse({ provider: 'openai', apiKey: 'sk-1' }).success).toBe(true);
  });

  it('rejects an empty key and an unknown provider', () => {
    expect(issues({ provider: 'openai', apiKey: '' })).toEqual([['apiKey', 'Required']]);
    expect(llmApiKeySchema.safeParse({ provider: 'nope', apiKey: 'k' }).success).toBe(false);
  });

  it('rejects a base URL on a built-in provider, but ignores a blank one', () => {
    expect(issues({ provider: 'openai', apiKey: 'k', baseUrl: 'https://x.test' })).toEqual([
      ['baseUrl', 'Only valid for a custom provider'],
    ]);
    expect(
      llmApiKeySchema.safeParse({ provider: 'openai', apiKey: 'k', baseUrl: '  ' }).success,
    ).toBe(true);
  });

  describe('custom provider', () => {
    const base = { provider: CUSTOM_LLM_PROVIDER, apiKey: 'k' };

    it('requires a model and a base URL', () => {
      expect(issues(base)).toEqual([
        ['model', 'Required for a custom provider'],
        ['baseUrl', 'Required for a custom provider'],
      ]);
    });

    it('treats whitespace-only values as missing', () => {
      expect(issues({ ...base, model: '  ', baseUrl: ' ' })).toHaveLength(2);
    });

    it('requires an http(s) base URL', () => {
      expect(issues({ ...base, model: 'm', baseUrl: 'ftp://host' })).toEqual([
        ['baseUrl', 'Must start with http:// or https://'],
      ]);
    });

    it('accepts http and https base URLs', () => {
      for (const baseUrl of ['http://localhost:11434/v1', ' https://llm.example.com/v1 ']) {
        expect(llmApiKeySchema.safeParse({ ...base, model: 'm', baseUrl }).success).toBe(true);
      }
    });
  });
});
