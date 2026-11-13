import { describe, it, expect } from 'vitest';
import { toAiGeneration } from '#src/use-cases/aiFeedback/toAiGeneration.js';

describe('toAiGeneration (JEF-569)', () => {
  it('copies the trace id of the generation that answered', () => {
    expect(
      toAiGeneration({ provider: 'openai', model: 'm', source: 'byok', traceId: 'trace-1' }, 3),
    ).toEqual({
      provider: 'openai',
      model: 'm',
      promptVersion: 3,
      source: 'byok',
      tier: null,
      traceId: 'trace-1',
    });
  });

  it('has no trace id when the call was not wrapped by AI analytics', () => {
    expect(
      toAiGeneration({ provider: 'openai', model: 'm', source: 'byok' }, 3)?.traceId,
    ).toBeNull();
  });

  it('has no snapshot when the call was not usage-tracked', () => {
    expect(toAiGeneration(undefined, 3)).toBeNull();
  });
});
