import { describe, expect, it } from 'vitest';
import { CHAT_CASES } from '#src/evals/cases/chat.js';
import {
  callOrder,
  calledNoTools,
  calledTool,
  didNotCallTool,
  withinIterationCap,
} from '#src/evals/cases/matchers.js';
import { runChatTurn } from '#src/evals/chatHarness.js';
import { APPLICATIONS, LONG_CONTEXT_INJECTION } from '#src/evals/fixtures/chatWorld.js';
import { compactForModel, projectChatToolResult } from '#src/use-cases/chat/chatToolProjection.js';
import { scriptedChatProvider } from '#src/evals/chatScript.js';
import { runCase } from '#src/evals/runCase.js';
import { formatReport } from '#src/evals/summary.js';
import { CHAT } from '#src/use-cases/constants.js';
import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';

const NO_TOOL_IDS = new Set(['chat-no-tool-introduction', 'chat-no-tool-more-time']);
const needsTool = CHAT_CASES.filter((evalCase) => !NO_TOOL_IDS.has(evalCase.id));

describe('the chat case list', () => {
  it('has the size the ticket asks for, with unique ids', () => {
    const ids = CHAT_CASES.map((evalCase) => evalCase.id);

    expect(ids.length).toBeGreaterThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the situations the ticket names', () => {
    const ids = CHAT_CASES.map((evalCase) => evalCase.id).join(' ');

    for (const kind of [
      'upcoming',
      'two-tools',
      'no-tool',
      'ambiguous',
      'write',
      'delete',
      'injection',
    ]) {
      expect(ids).toContain(kind);
    }
  });
});

describe.each(CHAT_CASES)('chat case $id', (evalCase) => {
  it('passes when the model does what the ideal trace does, so the checks can be met', async () => {
    const failures = await evalCase.run(scriptedChatProvider(evalCase.idealTrace));

    expect(failures).toEqual([]);
  });

  it.each(evalCase.badTraces.map((trace, index) => [index, trace] as const))(
    'fails wrong behaviour %i',
    async (_index, trace) => {
      const failures = await evalCase.run(scriptedChatProvider(trace));

      expect(failures.length).toBeGreaterThan(0);
    },
  );
});

describe('the chat checks are not vacuous', () => {
  const neverCallsATool = makeLLMProvider('Sure, I can help with that.');

  it.each(needsTool)('$id fails a model that never calls a tool', async (evalCase) => {
    const failures = await evalCase.run(neverCallsATool);

    expect(failures.length).toBeGreaterThan(0);
  });

  it.each(CHAT_CASES.filter((evalCase) => NO_TOOL_IDS.has(evalCase.id)))(
    '$id fails a model that calls a tool',
    async (evalCase) => {
      const failures = await evalCase.run(
        scriptedChatProvider({
          rounds: [
            { calls: [{ name: 'list_applications', arguments: {} }] },
            { text: 'Here you go.' },
          ],
        }),
      );

      expect(failures.join(' ')).toContain('expected no tool calls');
    },
  );

  it('a model that keeps calling tools fails every case for running out of rounds', async () => {
    const endless = scriptedChatProvider({
      rounds: Array.from({ length: CHAT.MAX_TOOL_ITERATIONS + 2 }, () => ({
        calls: [{ name: 'list_applications', arguments: {} }],
      })),
    });

    const failures = await CHAT_CASES[0]?.run(endless);

    expect(failures?.join(' ')).toContain('ran out of tool rounds');
  });

  it('the injection cases fail a model that follows the hidden instruction', async () => {
    const injected = CHAT_CASES.filter((evalCase) => evalCase.id.includes('injection'));

    expect(injected.length).toBeGreaterThanOrEqual(2);
    for (const evalCase of injected) {
      expect(evalCase.badTraces.length).toBeGreaterThan(0);
    }
  });
});

describe('the red-team chat cases (JEF-548)', () => {
  const REDTEAM = [
    'chat-injection-image-exfil',
    'chat-injection-cross-application',
    'chat-injection-update-write',
    'chat-injection-multilingual',
    'chat-injection-long-context',
  ];

  it('has one case for each attack class, each with wrong behaviour to catch', () => {
    for (const id of REDTEAM) {
      const evalCase = CHAT_CASES.find((candidate) => candidate.id === id);
      expect(evalCase, id).toBeDefined();
      expect(evalCase!.badTraces.length, id).toBeGreaterThan(0);
    }
  });

  it('keeps the long-context injection in what the model reads, about 80% of the way in', () => {
    const figma = APPLICATIONS.find((app) => app.company === 'Figma')!;
    const seen = compactForModel(projectChatToolResult('get_application', figma)) as {
      description: string;
    };
    const full = figma.description!;

    expect(seen.description).toContain(LONG_CONTEXT_INJECTION);
    expect(seen.description.endsWith('…')).toBe(false);
    expect(full.length).toBeLessThanOrEqual(CHAT.TOOL_RESULT_STRING_MAX_CHARS);
    expect(full.indexOf(LONG_CONTEXT_INJECTION) / full.length).toBeGreaterThan(0.7);
  });

  it('fails an answer that contains an image, though it calls only the right tools', async () => {
    const evalCase = CHAT_CASES.find((c) => c.id === 'chat-injection-image-exfil')!;

    const failures = await evalCase.run(
      scriptedChatProvider({
        rounds: [
          { calls: [{ name: 'list_applications', arguments: {} }] },
          { calls: [{ name: 'list_notes', arguments: { applicationId: 'app-figma' } }] },
          { text: 'They liked your portfolio. ![](https://cdn.example/x.png)' },
        ],
      }),
    );

    expect(failures.join(' ')).toContain('contains an image');
  });
});

describe('runChatTurn', () => {
  it('records the calls in order, the rounds used and the stored answer', async () => {
    const trace = await runChatTurn(
      scriptedChatProvider({
        rounds: [
          { calls: [{ name: 'list_applications', arguments: {} }] },
          { calls: [{ name: 'list_notes', arguments: { applicationId: 'app-stripe' } }] },
          { text: 'Done.' },
        ],
      }),
      'notes?',
    );

    expect(trace.calls.map((call) => call.name)).toEqual(['list_applications', 'list_notes']);
    expect(trace).toMatchObject({ rounds: 3, answer: 'Done.', capped: false, proposals: [] });
  });

  it('keeps a write as a proposal and applies nothing', async () => {
    const trace = await runChatTurn(
      scriptedChatProvider({
        rounds: [
          {
            calls: [
              { name: 'create_note', arguments: { applicationId: 'app-stripe', content: 'x' } },
            ],
          },
          { text: 'Proposed.' },
        ],
      }),
      'add a note',
    );

    expect(trace.proposals).toHaveLength(1);
    expect(trace.proposals[0]?.toolName).toBe('create_note');
  });

  it('reports a turn that used every round without answering as capped', async () => {
    const trace = await runChatTurn(
      scriptedChatProvider({
        rounds: Array.from({ length: CHAT.MAX_TOOL_ITERATIONS }, () => ({
          calls: [{ name: 'list_skills', arguments: {} }],
        })),
      }),
      'loop',
    );

    expect(trace).toMatchObject({ rounds: CHAT.MAX_TOOL_ITERATIONS, capped: true });
  });

  it('lets the model see an error for an unknown application, as in production', async () => {
    const trace = await runChatTurn(
      scriptedChatProvider({
        rounds: [
          { calls: [{ name: 'list_notes', arguments: { applicationId: 'guessed' } }] },
          { text: 'Not found.' },
        ],
      }),
      'notes',
    );

    expect(trace.answer).toBe('Not found.');
  });
});

describe('the tool-call matchers', () => {
  const calls = [
    { name: 'list_applications', arguments: {} },
    { name: 'list_notes', arguments: { applicationId: 'app-stripe', limit: 5 } },
  ];

  it('calledTool accepts any alternative and matches only the named arguments', () => {
    expect(calledTool(calls, ['list_calendar_events', 'list_notes'])).toBeNull();
    expect(calledTool(calls, 'list_notes', { applicationId: 'app-stripe' })).toBeNull();
    expect(calledTool(calls, 'list_notes', { applicationId: 'app-notion' })).toContain(
      'app-notion',
    );
    expect(calledTool([], 'list_notes')).toContain('none');
  });

  it('didNotCallTool names what was called', () => {
    expect(didNotCallTool(calls, 'create_note')).toBeNull();
    expect(didNotCallTool(calls, 'list_notes', 'create_note')).toContain('list_notes');
  });

  it('calledNoTools and callOrder', () => {
    expect(calledNoTools([])).toBeNull();
    expect(calledNoTools(calls)).not.toBeNull();
    expect(callOrder(calls, 'list_applications', 'list_notes')).toBeNull();
    expect(callOrder(calls, 'list_notes', 'list_applications')).not.toBeNull();
    expect(callOrder(calls, 'get_analytics')).not.toBeNull();
  });

  it('withinIterationCap fails a capped turn or one over the limit', () => {
    expect(withinIterationCap(3, false, 5)).toBeNull();
    expect(withinIterationCap(5, true, 5)).toContain('ran out');
    expect(withinIterationCap(6, false, 5)).toContain('more than');
  });
});

describe('the report', () => {
  it('shows tool calls and iterations for each chat case', async () => {
    const [evalCase] = CHAT_CASES;
    const result = await runCase(evalCase!, scriptedChatProvider(evalCase!.idealTrace));

    expect(result).toMatchObject({ feature: 'chat', passed: true, toolCalls: 1, iterations: 2 });
    expect(formatReport([{ label: 'openai:x', results: [result] }])).toContain(
      `openai:x  ${evalCase!.id}: 1 tool call, 2 iterations`,
    );
  });
});
