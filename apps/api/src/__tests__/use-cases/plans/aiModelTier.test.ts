import { describe, expect, it } from 'vitest';
import { aiModelTier } from '#src/use-cases/plans/aiModelTier.js';
import { AI_FEATURE } from '#src/use-cases/constants.js';

describe('aiModelTier', () => {
  it('gives Free the lite tier for every feature', () => {
    for (const feature of Object.values(AI_FEATURE)) {
      expect(aiModelTier('free', feature)).toBe('lite');
    }
  });

  // JEF-557: gpt-oss-120b (mid) invented about three times as many claims as
  // Gemma (lite) in resumes and cover letters, so Pro stays on lite too.
  it('gives Pro the lite tier for every feature, cover letters and resumes included', () => {
    for (const feature of Object.values(AI_FEATURE)) {
      expect(aiModelTier('pro', feature)).toBe('lite');
    }
  });
});
