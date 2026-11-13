import { describe, it, expect } from 'vitest';
import {
  generationFromColumns,
  generationToColumns,
} from '#src/infrastructure/db/repositories/aiGenerationColumns.js';
import { makeAiGeneration } from '#src/__tests__/helpers/mocks/aiFeedback.js';

describe('aiGenerationColumns (JEF-569)', () => {
  it('round-trips the trace id with the rest of the snapshot', () => {
    const generation = makeAiGeneration({ traceId: 'trace-1' });

    expect(generationFromColumns(generationToColumns(generation))).toEqual(generation);
    expect(generationToColumns(generation).aiTraceId).toBe('trace-1');
  });

  it('reads output from before the trace id as having none', () => {
    const generation = generationFromColumns({
      aiProvider: 'openai',
      aiModel: 'm',
      aiPromptVersion: 1,
      aiSource: 'byok',
      aiTier: null,
      aiTraceId: null,
    });

    expect(generation?.traceId).toBeNull();
  });

  it('is null when the row never had a snapshot', () => {
    expect(generationFromColumns(generationToColumns(null))).toBeNull();
  });
});
