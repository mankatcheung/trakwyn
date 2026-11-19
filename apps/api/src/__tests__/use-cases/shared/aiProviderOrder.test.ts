import { describe, it, expect } from 'vitest';
import {
  effectiveAiProviderOrder,
  type AiProviderOrderSettings,
} from '#src/use-cases/shared/aiProviderOrder.js';

const settings = (overrides: Partial<AiProviderOrderSettings> = {}): AiProviderOrderSettings => ({
  aiProviderOrder: null,
  aiSource: 'auto',
  defaultLlmProvider: null,
  llmFallbackWhenLimited: false,
  ...overrides,
});

const proUser = { autoMayUseTrakwyn: true };
const freeUser = { autoMayUseTrakwyn: false };

describe('effectiveAiProviderOrder', () => {
  describe('with a saved list', () => {
    it('returns it as stored, whatever the older settings say', () => {
      const saved = settings({
        aiProviderOrder: ['anthropic', 'trakwyn'],
        aiSource: 'own',
        defaultLlmProvider: 'openai',
        llmFallbackWhenLimited: true,
      });
      expect(effectiveAiProviderOrder(saved, ['openai', 'anthropic'], proUser)).toEqual([
        'anthropic',
        'trakwyn',
      ]);
    });

    it('does not drop an entry that has no key: the caller decides what can run', () => {
      const saved = settings({ aiProviderOrder: ['deleted-key', 'openai'] });
      expect(effectiveAiProviderOrder(saved, ['openai'], proUser)).toEqual([
        'deleted-key',
        'openai',
      ]);
    });

    it('returns a copy, so a caller cannot change the stored list', () => {
      const stored = ['openai'];
      const result = effectiveAiProviderOrder(settings({ aiProviderOrder: stored }), [], proUser);
      result.push('trakwyn');
      expect(stored).toEqual(['openai']);
    });
  });

  describe('with no saved list, from the older settings', () => {
    it('trakwyn: the platform only, even with keys', () => {
      const user = settings({ aiSource: 'trakwyn', defaultLlmProvider: 'openai' });
      expect(effectiveAiProviderOrder(user, ['openai'], proUser)).toEqual(['trakwyn']);
    });

    it('own: the default key alone when fall-through is off', () => {
      const user = settings({ aiSource: 'own', defaultLlmProvider: 'anthropic' });
      expect(effectiveAiProviderOrder(user, ['openai', 'anthropic'], proUser)).toEqual([
        'anthropic',
      ]);
    });

    it('own: the default, then the other keys oldest first, when fall-through is on', () => {
      const user = settings({
        aiSource: 'own',
        defaultLlmProvider: 'anthropic',
        llmFallbackWhenLimited: true,
      });
      expect(effectiveAiProviderOrder(user, ['openai', 'anthropic', 'groq'], proUser)).toEqual([
        'anthropic',
        'openai',
        'groq',
      ]);
    });

    it('own: nothing when there are no keys', () => {
      expect(effectiveAiProviderOrder(settings({ aiSource: 'own' }), [], proUser)).toEqual([]);
    });

    it('stands the oldest key in for a default that was deleted', () => {
      const user = settings({ aiSource: 'own', defaultLlmProvider: 'gone' });
      expect(effectiveAiProviderOrder(user, ['openai', 'anthropic'], proUser)).toEqual(['openai']);
    });

    it('auto with a key: the own-key chain, never the platform', () => {
      const user = settings({ aiSource: 'auto', defaultLlmProvider: 'openai' });
      expect(effectiveAiProviderOrder(user, ['openai'], proUser)).toEqual(['openai']);
    });

    it('auto without a key: the platform when it may answer', () => {
      expect(effectiveAiProviderOrder(settings(), [], proUser)).toEqual(['trakwyn']);
    });

    it('auto without a key: nothing when it may not, so the user gets AI_NOT_CONFIGURED as before', () => {
      expect(effectiveAiProviderOrder(settings(), [], freeUser)).toEqual([]);
    });
  });
});
