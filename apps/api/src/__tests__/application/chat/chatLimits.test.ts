import { describe, expect, it } from 'vitest';
import { chatLimitsFor } from '#src/use-cases/chat/chatLimits.js';

describe('chatLimitsFor', () => {
  it('tightens hosted Free chat', () => {
    expect(chatLimitsFor({ source: 'platform', plan: 'free' })).toEqual({
      maxToolIterations: 3,
      maxHistoryChars: 12_000,
    });
  });

  it.each([[{ source: 'platform', plan: 'pro' }], [{ source: 'byok' }], [null]] as const)(
    'keeps 5 / 24_000 for %j',
    (resolution) => {
      expect(chatLimitsFor(resolution)).toEqual({ maxToolIterations: 5, maxHistoryChars: 24_000 });
    },
  );
});
