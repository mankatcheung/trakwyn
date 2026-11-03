import { describe, expect, it } from 'vitest';
import { aiModelTier } from '#src/use-cases/plans/aiModelTier.js';
import { AI_FEATURE } from '#src/use-cases/constants.js';

describe('aiModelTier', () => {
  it('gives Free the lite tier for every feature', () => {
    for (const feature of Object.values(AI_FEATURE)) {
      expect(aiModelTier('free', feature)).toBe('lite');
    }
  });

  it('gives Pro the mid tier for cover letters and resumes only', () => {
    for (const feature of Object.values(AI_FEATURE)) {
      const expected = feature === AI_FEATURE.COVER_LETTER || feature === AI_FEATURE.RESUME;
      expect(aiModelTier('pro', feature)).toBe(expected ? 'mid' : 'lite');
    }
  });
});
