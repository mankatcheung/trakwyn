import { describe, it, expect } from 'vitest';
import {
  buildChatMessages,
  CHAT_SYSTEM_PROMPT,
  historyToPromptMessages,
  summarizeToolResult,
  trimHistoryToBudget,
} from '#src/use-cases/chat/chatAssembly.js';
import { makeMessage } from '#src/__tests__/helpers/mocks/chat.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';

describe('buildChatMessages cache breakpoints (T2)', () => {
  it('marks the last system block, so tools + system + custom prompt cache as one prefix', () => {
    const messages = buildChatMessages([], 'hi', makeUser({ customAiPrompt: 'be terse' }));

    expect(messages.slice(0, 2)).toEqual([
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'system', content: 'be terse', cacheBreakpoint: true },
    ]);
  });

  it('marks the fixed prompt itself when there is no custom prompt', () => {
    const messages = buildChatMessages([], 'hi', makeUser({ customAiPrompt: null }));

    expect(messages[0]).toEqual({
      role: 'system',
      content: CHAT_SYSTEM_PROMPT,
      cacheBreakpoint: true,
    });
  });

  it('marks the last stored message and leaves the new one unmarked', () => {
    const history = [
      makeMessage({ role: 'user', content: 'q1' }),
      makeMessage({ role: 'assistant', content: 'a1' }),
    ];

    const messages = buildChatMessages(history, 'q2', null);

    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1', cacheBreakpoint: true },
      { role: 'user', content: 'q2' },
    ]);
  });

  it("uses at most two markers, leaving room for the tool loop's moving one", () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      makeMessage({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }),
    );
    const messages = buildChatMessages(history, 'q', makeUser({ customAiPrompt: 'x' }));

    expect(messages.filter((m) => m.cacheBreakpoint)).toHaveLength(2);
  });
});

describe('trimHistoryToBudget (T6)', () => {
  const msg = (content: string) => makeMessage({ content });

  it('keeps everything when it fits', () => {
    const history = [msg('aaa'), msg('bbb')];
    expect(trimHistoryToBudget(history, 10)).toEqual(history);
  });

  it('drops the oldest messages first until the rest fits', () => {
    const history = [msg('1111'), msg('2222'), msg('3333'), msg('4444')];
    expect(trimHistoryToBudget(history, 9)).toEqual([msg('3333'), msg('4444')]);
  });

  it('keeps the newest message alone when even it exceeds the budget', () => {
    const history = [msg('short'), msg('x'.repeat(50))];
    expect(trimHistoryToBudget(history, 10)).toEqual([history[1]]);
  });

  it('returns an empty history unchanged', () => {
    expect(trimHistoryToBudget([], 10)).toEqual([]);
  });
});

describe('tool trace (F10)', () => {
  it('summarises a page of applications as ids and names, never the payload', () => {
    const line = summarizeToolResult(
      { id: 'c1', name: 'list_applications', arguments: { status: 'applied' } },
      {
        items: [
          { id: 'app-1', company: 'Acme', role: 'Engineer', description: 'x'.repeat(500) },
          { id: 'app-2', company: 'Globex', role: 'Staff' },
        ],
        hasNextPage: false,
      },
    );

    expect(line).toBe(
      'list_applications({"status":"applied"}) → 2 results: app-1 Acme/Engineer, app-2 Globex/Staff',
    );
    expect(line).not.toContain('xxxx');
  });

  it('caps the rows it names and counts the rest', () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, name: `Skill ${i}` }));
    const line = summarizeToolResult({ id: 'c', name: 'list_skills', arguments: {} }, items);

    expect(line).toMatch(/^list_skills → 14 results: s0 Skill 0, /);
    expect(line).toMatch(/, \+4 more$/);
  });

  it('records a failed call as an error line and a single record by its label', () => {
    expect(
      summarizeToolResult(
        { id: 'c', name: 'get_application', arguments: { applicationId: 'nope' } },
        {
          error: 'Application not found',
        },
      ),
    ).toBe('get_application({"applicationId":"nope"}) → error: Application not found');
    expect(
      summarizeToolResult(
        { id: 'c', name: 'get_application', arguments: {} },
        {
          id: 'app-1',
          company: 'Acme',
          role: 'Engineer',
        },
      ),
    ).toBe('get_application → app-1 Acme/Engineer');
  });

  it('renders a stored trace back into the assistant turn, and only there', () => {
    const history = [
      makeMessage({ role: 'user', content: 'which apps?' }),
      makeMessage({
        role: 'assistant',
        content: 'You have two.',
        toolTrace: 'list_applications → 2 results: app-1 Acme/Engineer, app-2 Globex/Staff',
      }),
      makeMessage({ role: 'assistant', content: 'plain', toolTrace: null }),
    ];

    expect(historyToPromptMessages(history).map((m) => m.content)).toEqual([
      'which apps?',
      'You have two.\n\n[Looked up for this reply: list_applications → 2 results: app-1 Acme/Engineer, app-2 Globex/Staff]',
      'plain',
    ]);
  });
});
