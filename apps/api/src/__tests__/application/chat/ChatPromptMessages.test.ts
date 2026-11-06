import { describe, it, expect } from 'vitest';
import { buildChatMessages } from '#src/use-cases/chat/chatAssembly.js';
import { makeMessage } from '#src/__tests__/helpers/mocks/chat.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';

/**
 * The exact prompt a chat turn sends (JEF-505), cache breakpoints included.
 * Recorded before the system prompt moved into `use-cases/prompts/chat.ts`:
 * Anthropic caches the tools + system prefix, so a changed character here is
 * a cache miss on every conversation.
 */
describe('buildChatMessages prompt', () => {
  const history = [
    makeMessage({ role: 'user', content: 'q1' }),
    makeMessage({ role: 'assistant', content: 'a1' }),
    makeMessage({ role: 'system', content: 'User confirmed: Move Acme to interviewing' }),
  ];

  it('with a custom prompt and history', () => {
    expect(
      buildChatMessages(history, 'next question', makeUser({ customAiPrompt: 'be terse' })),
    ).toMatchSnapshot();
  });

  it('with no custom prompt and no history', () => {
    expect(buildChatMessages([], 'hi', null)).toMatchSnapshot();
  });
});
