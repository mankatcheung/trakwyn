import { describe, expect, it } from 'vitest';
import { postingForPrompt } from '#src/use-cases/shared/postingForPrompt.js';

describe('postingForPrompt (JEF-591)', () => {
  it('prefers the full posting to its summary', () => {
    expect(
      postingForPrompt({
        description: 'A backend role.',
        postingText: 'Requirements: Kubernetes, PostgreSQL, on-call rota.',
      }),
    ).toBe('Requirements: Kubernetes, PostgreSQL, on-call rota.');
  });

  it('falls back to the description when no posting was captured', () => {
    expect(postingForPrompt({ description: ' A backend role. ', postingText: null })).toBe(
      'A backend role.',
    );
    expect(postingForPrompt({ description: 'A backend role.', postingText: '   ' })).toBe(
      'A backend role.',
    );
  });

  it('takes a description that is longer than the stored posting', () => {
    // A client that cannot edit the posting (mobile) pasted a fuller one here.
    const pasted = `The whole posting, pasted into the description. ${'x'.repeat(200)}`;
    expect(
      postingForPrompt({ description: pasted, postingText: 'An older, shorter capture.' }),
    ).toBe(pasted);
  });

  it('is null when the application has neither', () => {
    expect(postingForPrompt({ description: null, postingText: null })).toBeNull();
    expect(postingForPrompt({ description: ' ', postingText: '' })).toBeNull();
  });
});
