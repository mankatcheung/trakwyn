/**
 * Test doubles for the llm domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { ICompanyBriefingRepository } from '#src/use-cases/ports/ICompanyBriefingRepository.js';
import type { ICompanyResearchSource } from '#src/use-cases/ports/ICompanyResearchSource.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { ILLMProviderFactory } from '#src/use-cases/ports/ILLMProviderFactory.js';
import type { ILlmApiKeyCipher } from '#src/use-cases/ports/ILlmApiKeyCipher.js';
import type { ILlmApiKeyRepository } from '#src/use-cases/ports/ILlmApiKeyRepository.js';
import type { ILlmUsageEventRepository } from '#src/use-cases/ports/ILlmUsageEventRepository.js';
import type { LlmApiKey } from '#src/domain/llmApiKey/LlmApiKey.js';

export const makeLLMProvider = (response = 'llm response'): ILLMProvider => ({
  complete: vi.fn().mockResolvedValue({ content: response, usage: null }),
  completeWithToolsStream: vi.fn(async function* () {
    yield { type: 'done' as const, content: response, toolCalls: [], usage: null };
  }),
});

export const makeLLMProviderFactory = (
  overrides?: Partial<ILLMProviderFactory>,
): ILLMProviderFactory => ({
  forUser: vi.fn().mockResolvedValue(makeLLMProvider()),
  resolveForUser: vi.fn().mockImplementation(async (_userId: string, provider?: string) => ({
    provider: makeLLMProvider(),
    providerId: provider ?? 'openai',
    fellBackFrom: null,
    source: 'byok',
  })),
  fromCredentials: vi.fn().mockReturnValue(makeLLMProvider()),
  ...overrides,
});

export const makeLlmApiKeyCipher = (overrides?: Partial<ILlmApiKeyCipher>): ILlmApiKeyCipher => ({
  encrypt: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
  decrypt: vi.fn((ciphertext: string) => ciphertext.replace(/^encrypted:/, '')),
  ...overrides,
});

export const makeLlmApiKeyRepository = (
  overrides?: Partial<ILlmApiKeyRepository>,
): ILlmApiKeyRepository => ({
  upsert: vi.fn(),
  findByUserIdAndProvider: vi.fn().mockResolvedValue(null),
  findAllByUserId: vi.fn().mockResolvedValue([]),
  setMonthlyTokenLimit: vi.fn().mockResolvedValue(null),
  delete: vi.fn(),
  ...overrides,
});

export const makeLlmUsageEventRepository = (
  overrides?: Partial<ILlmUsageEventRepository>,
): ILlmUsageEventRepository => ({
  record: vi.fn().mockResolvedValue(undefined),
  summarizeByUserId: vi.fn().mockResolvedValue([]),
  sumCostMicros: vi.fn().mockResolvedValue(0),
  ...overrides,
});

export const makeLlmApiKey = (overrides?: Partial<LlmApiKey>): LlmApiKey => ({
  id: 'llm-key-1',
  userId: 'user-1',
  provider: 'openai',
  apiKey: 'encrypted:sk-test',
  model: null,
  monthlyTokenLimit: null,
  baseUrl: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeCompanyBriefingRepository = (
  overrides?: Partial<ICompanyBriefingRepository>,
): ICompanyBriefingRepository => ({
  findByApplicationId: vi.fn().mockResolvedValue(null),
  upsert: vi.fn().mockImplementation((data) => Promise.resolve({ ...data })),
  ...overrides,
});

/** Reads nothing by default, which is how a briefing behaved before research existed. */
export const makeCompanyResearchSource = (
  overrides?: Partial<ICompanyResearchSource>,
): ICompanyResearchSource => ({
  research: vi.fn().mockResolvedValue(null),
  ...overrides,
});
