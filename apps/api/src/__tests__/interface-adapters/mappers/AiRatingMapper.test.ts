import { describe, it, expect } from 'vitest';
import { toAiRatingDTO } from '#src/interface-adapters/mappers/AiRatingMapper.js';
import { makeAiFeedback } from '#src/__tests__/helpers/mocks/aiFeedback.js';

describe('toAiRatingDTO (JEF-547)', () => {
  it('keeps the rating and reason and nothing else of the row', () => {
    const dto = toAiRatingDTO(makeAiFeedback({ rating: 'down', reason: 'ignored_my_request' }));

    expect(dto).toEqual({ rating: 'down', reason: 'ignored_my_request' });
  });

  it('is null when there is no rating', () => {
    expect(toAiRatingDTO(null)).toBeNull();
    expect(toAiRatingDTO(undefined)).toBeNull();
  });
});
