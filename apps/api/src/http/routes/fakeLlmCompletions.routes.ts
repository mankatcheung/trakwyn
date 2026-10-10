import type { RouteDefinition } from '#src/http/ports/RouteDefinition.js';
import { ROUTES } from '#src/http/constants.js';
import { MOCK_INTERVIEW_PROMPT_TASK } from '#src/use-cases/constants.js';

const FAKE_CHAT_REPLY = 'Fake assistant reply for e2e testing.';

const FAKE_MOCK_QUESTIONS = {
  questions: [
    'Tell me about a system you designed that had to scale.',
    'How do you decide between shipping fast and paying down technical debt?',
    'Describe a time you disagreed with a teammate and how you resolved it.',
  ],
};
const FAKE_MOCK_ANSWER =
  'I would start by clarifying the goal, then walk through the trade-offs I weighed and what I learned.';

/**
 * The OpenAI streaming chunk shape `OpenAICompatibleLLMProvider.
 * completeWithToolsStream()` parses (JEF-239) — one delta chunk carrying the
 * whole canned reply, then a finish chunk, then the `[DONE]` sentinel. Sent
 * as a single `.send()` body rather than genuinely streamed in pieces: this
 * fake endpoint stays on the `RouteDefinition`/`IHttpResponse` abstraction
 * (a real SSE endpoint needs incremental raw-response writes that port
 * doesn't support — see `ROUTES.CHAT_STREAM`'s doc comment), and the
 * consuming parser only cares that the bytes form valid SSE frames, not how
 * many `fetch()` reads they arrived in.
 */
function fakeChatStreamBody(content: string): string {
  const deltaChunk = JSON.stringify({ choices: [{ delta: { role: 'assistant', content } }] });
  const finishChunk = JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] });
  return `data: ${deltaChunk}\n\ndata: ${finishChunk}\n\ndata: [DONE]\n\n`;
}

/**
 * A same-origin stand-in for a real OpenAI-compatible `/chat/completions`
 * endpoint, registered only when `LLM_PROVIDER_MODE=fake`. Not a new
 * provider type on the backend or a new option in Settings → AI's provider
 * dropdown — an e2e test (or a developer) points the existing "Custom
 * (OpenAI-compatible)" provider's own base URL here, the same real mechanism
 * self-hosted/OpenAI-compatible endpoints already use in production.
 *
 * Two canned response shapes, chosen by whether the request carries `tools`:
 * present means a chat request (`StreamChatWithAssistantUseCase`'s
 * `completeWithToolsStream`, always `stream: true` — JEF-239) — replies as
 * an SSE-framed stream with plain text and no tool calls, which ends the
 * tool-use loop after one round. Absent `tools` means a `complete()` call —
 * currently only GenerateResumeUseCase, which requires strict JSON matching
 * its schema and grounds every company/institution against the user's own
 * stored profile, so the canned resume below only works together with a
 * test that creates matching work-experience/education fixtures first.
 */
export function fakeLlmCompletionsRoutes(): RouteDefinition[] {
  return [
    {
      method: 'POST',
      path: ROUTES.LLM_FAKE_COMPLETIONS,
      handler: async (req, res) => {
        const body = req.body as
          { tools?: unknown; messages?: Array<{ role?: string; content?: unknown }> } | undefined;

        if (body?.tools) {
          res
            .status(200)
            .header('Content-Type', 'text/event-stream')
            .send(fakeChatStreamBody(FAKE_CHAT_REPLY));
          return;
        }

        // The practice-interview generators (JEF-393) say which task they are
        // in their system prompt; everything else gets the resume reply below.
        const system = (body?.messages ?? [])
          .filter((m) => m.role === 'system' && typeof m.content === 'string')
          .map((m) => m.content as string)
          .join('\n');
        if (system.includes(MOCK_INTERVIEW_PROMPT_TASK.QUESTIONS)) {
          res.send({
            choices: [
              { message: { content: JSON.stringify(FAKE_MOCK_QUESTIONS), tool_calls: [] } },
            ],
          });
          return;
        }
        if (system.includes(MOCK_INTERVIEW_PROMPT_TASK.ANSWER)) {
          res.send({ choices: [{ message: { content: FAKE_MOCK_ANSWER, tool_calls: [] } }] });
          return;
        }

        const content = JSON.stringify({
          summary: 'Experienced engineer.',
          experience: [
            {
              company: 'Acme Corp',
              title: 'Senior Engineer',
              period: '2020 - Present',
              bullets: ['Built things.'],
            },
          ],
          education: [
            {
              institution: 'State University',
              qualification: 'BS Computer Science',
              period: '2016 - 2020',
            },
          ],
          skills: [{ category: 'Languages', items: ['TypeScript'] }],
        });

        res.send({ choices: [{ message: { content, tool_calls: [] } }] });
      },
    },
  ];
}
