import { describe, it, expect, vi } from 'vitest';
import {
  buildChatMessages,
  CHAT_SYSTEM_PROMPT,
  executeChatTool,
  historyToPromptMessages,
  summarizeToolResult,
  trimHistoryToBudget,
  type ChatToolDeps,
} from '#src/use-cases/chat/chatAssembly.js';
import { NotFoundError, ValidationError } from '#src/use-cases/errors/DomainError.js';
import { CHAT_TOOLS } from '#src/interface-adapters/llm/toolCatalogue.js';
import {
  makeChatActionProposalRepository,
  makeChatWriteTools,
  makeMessage,
} from '#src/__tests__/helpers/mocks/chat.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeToolCallObserver } from '#src/__tests__/helpers/mocks/infrastructure.js';
import {
  makeEducationRepository,
  makeSkillRepository,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';

function makeToolDeps() {
  const stub = (result: unknown = []) => ({ execute: vi.fn().mockResolvedValue(result) });
  return {
    getApplicationsPageUseCase: stub({ items: [], hasNextPage: false, nextCursor: null }),
    getApplicationUseCase: stub(makeApplication({ id: 'app-1' })),
    getNotesUseCase: stub(),
    getContactsUseCase: stub(),
    getInterviewRoundsUseCase: stub(),
    getMockInterviewQuestionsUseCase: stub(),
    generateMockQuestionsUseCase: stub({ suggestions: [] }),
    generateMockAnswerUseCase: stub({ answer: '' }),
    generateTalkingPointsUseCase: stub({ nothingRelevant: true }),
    getDocumentsUseCase: stub(),
    getOffersUseCase: stub(),
    getActivityLogsUseCase: stub(),
    getCalendarEventsUseCase: stub(),
    getResponseTimeAnalyticsUseCase: stub({}),
    getApplicationChannelAnalyticsUseCase: stub({}),
    getInterviewRoundAnalyticsUseCase: stub({}),
    getOfferAnalyticsUseCase: stub({}),
    workExperienceRepository: makeWorkExperienceRepository(),
    educationRepository: makeEducationRepository(),
    skillRepository: makeSkillRepository(),
    toolCallObserver: makeToolCallObserver(),
    chatWriteTools: makeChatWriteTools(),
    chatActionProposalRepository: makeChatActionProposalRepository(),
    generateId: vi.fn().mockReturnValue('prop-new'),
  };
}

const toolCall = (name: string, args: Record<string, unknown> = {}) => ({
  id: 'call-1',
  name,
  arguments: args,
});

describe('executeChatTool observation (JEF-365)', () => {
  it('passes every chat read tool through the observer on the chat surface', async () => {
    const deps = makeToolDeps();
    const readTools = CHAT_TOOLS.filter((t) => t.access === 'read');

    for (const tool of readTools) {
      await executeChatTool(
        toolCall(tool.name, { applicationId: 'app-1' }),
        'user-1',
        'conv-1',
        deps as unknown as ChatToolDeps,
      );
    }

    expect(deps.toolCallObserver.calls.map((c) => [c.meta, c.reports])).toEqual(
      readTools.map((tool) => [{ surface: 'chat', name: tool.name }, ['succeeded']]),
    );
  });

  it('observes every chat write tool as proposed, never as succeeded', async () => {
    const deps = makeToolDeps();
    vi.mocked(deps.chatWriteTools.has).mockReturnValue(true);
    const writeTools = CHAT_TOOLS.filter((t) => t.access === 'write');

    for (const tool of writeTools) {
      await executeChatTool(
        toolCall(tool.name),
        'user-1',
        'conv-1',
        deps as unknown as ChatToolDeps,
      );
    }

    expect(deps.toolCallObserver.calls.map((c) => [c.meta, c.reports])).toEqual(
      writeTools.map((tool) => [{ surface: 'chat', name: tool.name }, ['proposed']]),
    );
  });

  it('routes the practice question tools to their use cases (JEF-393)', async () => {
    const deps = makeToolDeps();
    const run = (name: string, args: Record<string, unknown>) =>
      executeChatTool(toolCall(name, args), 'user-1', 'conv-1', deps as unknown as ChatToolDeps);

    await run('list_mock_interview_questions', { interviewRoundId: 'r1' });
    await run('generate_mock_interview_questions', {
      interviewRoundId: 'r1',
      prompt: 'system design',
      count: 3,
    });
    await run('generate_mock_interview_answer', { mockInterviewQuestionId: 'q1', prompt: 'short' });
    await run('generate_mock_talking_points', { mockInterviewQuestionId: 'q1' });

    expect(deps.getMockInterviewQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'r1',
    });
    expect(deps.generateMockQuestionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      roundId: 'r1',
      prompt: 'system design',
      count: 3,
      useProfile: false,
      documentId: undefined,
    });
    expect(deps.generateMockAnswerUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'q1',
      prompt: 'short',
      useProfile: false,
      documentId: undefined,
    });
    expect(deps.generateTalkingPointsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      questionId: 'q1',
      useProfile: true,
      documentId: undefined,
      save: false,
    });
  });

  it('offers the practice question write tool to chat as a proposal (JEF-469)', () => {
    expect(CHAT_TOOLS.map((t) => t.name)).toContain('create_mock_interview_question');
  });

  it('offers no delete to chat', () => {
    expect(CHAT_TOOLS.map((t) => t.name)).not.toContain('trash_application');
    expect(CHAT_TOOLS.filter((t) => 'destructive' in t && t.destructive)).toEqual([]);
  });

  it('reports success with the compacted result the model receives', async () => {
    const deps = makeToolDeps();

    const result = await executeChatTool(
      toolCall('list_skills'),
      'user-1',
      'conv-1',
      deps as unknown as ChatToolDeps,
    );

    expect(deps.toolCallObserver.calls[0]?.result).toBe(result);
  });

  it('reports an internal failure, while the model still gets the generic error', async () => {
    const deps = makeToolDeps();
    const bug = new Error('relation "skill" does not exist');
    vi.mocked(deps.skillRepository.findAllByUserId).mockRejectedValue(bug);

    const result = await executeChatTool(
      toolCall('list_skills'),
      'user-1',
      'conv-1',
      deps as unknown as ChatToolDeps,
    );

    expect(result).toEqual({ error: 'Tool call failed' });
    expect(deps.toolCallObserver.calls[0]).toMatchObject({ reports: ['failed'], error: bug });
  });

  it('reports a domain error, and the model gets its message', async () => {
    const deps = makeToolDeps();
    const notFound = new NotFoundError('Application');
    deps.getApplicationUseCase.execute.mockRejectedValue(notFound);

    const result = await executeChatTool(
      toolCall('get_application', { applicationId: 'missing' }),
      'user-1',
      'conv-1',
      deps as unknown as ChatToolDeps,
    );

    expect(result).toEqual({ error: notFound.message });
    expect(deps.toolCallObserver.calls[0]).toMatchObject({ reports: ['failed'], error: notFound });
  });

  it('reports an unknown tool as a ValidationError, keeping the reply the model saw before', async () => {
    const deps = makeToolDeps();

    const result = await executeChatTool(
      toolCall('drop_everything'),
      'user-1',
      'conv-1',
      deps as unknown as ChatToolDeps,
    );

    expect(result).toEqual({ error: 'Unknown tool: drop_everything' });
    expect(deps.toolCallObserver.calls[0]?.error).toBeInstanceOf(ValidationError);
  });

  it('never passes tool arguments to the observer', async () => {
    const deps = makeToolDeps();

    await executeChatTool(
      toolCall('get_application', { applicationId: 'app-secret' }),
      'user-1',
      'conv-1',
      deps as unknown as ChatToolDeps,
    );

    expect(JSON.stringify(deps.toolCallObserver.calls[0]?.meta)).not.toContain('app-secret');
  });
});

describe('executeChatTool write proposals (JEF-469)', () => {
  function proposingDeps() {
    const deps = makeToolDeps();
    vi.mocked(deps.chatWriteTools.has).mockImplementation((name) => name === 'update_application');
    vi.mocked(deps.chatWriteTools.prepare).mockResolvedValue({
      args: { applicationId: 'app-1', status: 'interviewing' },
      summary: 'Move Acme / Engineer to interviewing',
    });
    return deps;
  }
  const propose = (deps: ReturnType<typeof proposingDeps>) =>
    executeChatTool(
      toolCall('update_application', { applicationId: 'app-1', status: 'interviewing' }),
      'user-1',
      'conv-1',
      deps as unknown as ChatToolDeps,
    );

  it('saves the checked arguments as a pending proposal and applies nothing', async () => {
    const deps = proposingDeps();

    const result = await propose(deps);

    expect(deps.chatWriteTools.apply).not.toHaveBeenCalled();
    expect(deps.chatActionProposalRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prop-new',
        userId: 'user-1',
        conversationId: 'conv-1',
        toolName: 'update_application',
        args: { applicationId: 'app-1', status: 'interviewing' },
        summary: 'Move Acme / Engineer to interviewing',
        expiresAt: expect.any(Date),
      }),
    );
    expect(result).toMatchObject({ status: 'proposed', proposalId: 'prop-new' });
  });

  it('tells the model the change has not happened', async () => {
    const result = (await propose(proposingDeps())) as { note: string };

    expect(result.note).toMatch(/NOT applied/);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/NOT happened yet/);
    expect(CHAT_SYSTEM_PROMPT).toMatch(/Never say or imply that something was created/);
  });

  it('refuses a record the user does not own before anything is saved', async () => {
    const deps = proposingDeps();
    vi.mocked(deps.chatWriteTools.prepare).mockRejectedValue(
      new NotFoundError('Application not found'),
    );

    const result = await propose(deps);

    expect(result).toEqual({ error: 'Application not found' });
    expect(deps.chatActionProposalRepository.create).not.toHaveBeenCalled();
    expect(deps.toolCallObserver.calls[0]).toMatchObject({ reports: ['failed'] });
  });

  it('records a proposal in the tool trace as not applied', () => {
    const line = summarizeToolResult(toolCall('update_application', { applicationId: 'app-1' }), {
      status: 'proposed',
      proposalId: 'p1',
      summary: 'Move Acme to interviewing',
      note: 'x',
    });

    expect(line).toContain('proposed (not applied): Move Acme to interviewing');
  });

  it('feeds an app note about a proposal back as a bracketed user turn', () => {
    const [prompt] = historyToPromptMessages([
      makeMessage({ role: 'system', content: 'User confirmed: Move Acme to interviewing' }),
    ]);

    expect(prompt).toEqual({
      role: 'user',
      content: '[Note from the app: User confirmed: Move Acme to interviewing]',
    });
  });
});

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
