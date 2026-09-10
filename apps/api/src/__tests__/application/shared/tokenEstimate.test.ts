import { describe, it, expect } from 'vitest';
import { estimatePromptTokens } from '#src/use-cases/shared/tokenEstimate.js';

describe('estimatePromptTokens (F3)', () => {
  it('counts about four characters per token across messages', () => {
    expect(estimatePromptTokens([{ role: 'user', content: 'x'.repeat(400) }])).toBe(100);
  });

  it('includes tool schemas and serialized tool calls, which are sent every call', () => {
    const withTools = estimatePromptTokens(
      [{ role: 'user', content: 'hi' }],
      [{ name: 'list_applications', description: 'List', parameters: { type: 'object' } }],
    );
    const withoutTools = estimatePromptTokens([{ role: 'user', content: 'hi' }]);
    expect(withTools).toBeGreaterThan(withoutTools);

    const withCall = estimatePromptTokens([
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'list_notes', arguments: { applicationId: 'a' } }],
      },
    ]);
    expect(withCall).toBeGreaterThan(0);
  });

  it('rounds up so a tiny prompt is never charged zero', () => {
    expect(estimatePromptTokens([{ role: 'user', content: 'a' }])).toBe(1);
  });
});
