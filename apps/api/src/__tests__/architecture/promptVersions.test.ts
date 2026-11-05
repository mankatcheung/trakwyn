import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_FEATURE } from '#src/use-cases/constants.js';
import { buildMockInterviewContext } from '#src/use-cases/mockInterviewQuestions/mockInterviewContext.js';
import { chatPrompt } from '#src/use-cases/prompts/chat.js';
import { companyBriefingPrompt } from '#src/use-cases/prompts/companyBriefing.js';
import { coverLetterPrompt } from '#src/use-cases/prompts/coverLetter.js';
import { mockAnswerPrompt } from '#src/use-cases/prompts/mockAnswer.js';
import { mockQuestionsPrompt } from '#src/use-cases/prompts/mockQuestions.js';
import { parseCvPrompt } from '#src/use-cases/prompts/parseCv.js';
import { parseJobDescriptionPrompt } from '#src/use-cases/prompts/parseJobDescription.js';
import { resumePrompt } from '#src/use-cases/prompts/resume.js';
import { resumeMatchPrompt } from '#src/use-cases/prompts/resumeMatch.js';
import { talkingPointsPrompt } from '#src/use-cases/prompts/talkingPoints.js';
import type { PromptDefinition } from '#src/use-cases/prompts/types.js';
import type { LLMMessage } from '#src/use-cases/ports/ILLMProvider.js';

/**
 * Prompt versions (JEF-505).
 *
 * A prompt's `version` is recorded on every LLM usage event, so it only means
 * something if it moves whenever the wording does. Each prompt is rendered
 * here from a fixed input and its messages hashed; `RECORDED` pins the hash
 * per `id@version`.
 *
 *  - Changed the wording? The hash no longer matches. Bump the prompt's
 *    `version`, then add the new `id@version` line (and remove the old one).
 *  - Bumped the version without changing the wording, or added a prompt? The
 *    `id@version` is missing from `RECORDED`: add it.
 *  - Removed a prompt or replaced a version? Its old line is stale: remove it.
 *
 * Only the versioned wording is hashed. The user's own custom prompt is data,
 * not our wording, and is left out of every fixture.
 */
const APP = {
  company: 'Acme',
  role: 'Engineer',
  location: 'Remote',
  description: 'We build great software.',
};
const CONTEXT = buildMockInterviewContext(
  APP,
  { type: 'technical' },
  { content: 'Acme is a payments company.' },
);

interface Rendered {
  prompt: PromptDefinition<never>;
  messages: LLMMessage[];
}

const render = <Input>(prompt: PromptDefinition<Input>, input: Input): Rendered => ({
  prompt: prompt as PromptDefinition<never>,
  messages: prompt.build(input),
});

const RENDERED: Rendered[] = [
  render(coverLetterPrompt, {
    app: APP,
    profile: 'Engineer at Acme',
    resumeText: 'Ten years of TypeScript.',
    applicationContext: 'Notes: ask about the team',
    crossApplicationContext: 'Earlier letters: warm tone',
    customAiPrompt: null,
  }),
  render(resumePrompt, {
    app: APP,
    profileText: 'Engineer at Acme',
    applicationContext: 'Notes: ask about the team',
    crossApplicationContext: 'Earlier letters: warm tone',
    customAiPrompt: null,
  }),
  render(resumeMatchPrompt, { jobDescription: 'We need a TS engineer', resumeText: 'TypeScript' }),
  render(parseJobDescriptionPrompt, {
    text: 'We are Acme Corp looking for a Senior Engineer',
    hints: { company: 'Acme Corp', role: null, location: 'Remote', salary: null, description: '' },
  }),
  render(parseCvPrompt, { cvText: 'Jane Doe — CV text' }),
  render(companyBriefingPrompt, { app: APP, customAiPrompt: null }),
  render(mockQuestionsPrompt, {
    count: 5,
    contextText: CONTEXT.text,
    backgroundText: 'Candidate: Engineer at Acme',
    focus: 'system design',
    customAiPrompt: null,
  }),
  render(mockAnswerPrompt, {
    contextText: CONTEXT.text,
    backgroundText: 'Candidate: Engineer at Acme',
    question: 'Tell me about a hard bug.',
    request: 'keep it short',
    customAiPrompt: null,
  }),
  render(talkingPointsPrompt, {
    contextText: CONTEXT.text,
    backgroundText: 'Candidate: Engineer at Acme',
    question: 'Tell me about a hard bug.',
    customAiPrompt: null,
  }),
  render(chatPrompt, { history: [], newMessage: 'hi', customAiPrompt: null }),
];

const keyOf = ({ prompt }: Rendered) => `${prompt.id}@${prompt.version}`;
const hashOf = ({ messages }: Rendered) =>
  createHash('sha256').update(JSON.stringify(messages)).digest('hex').slice(0, 16);

/** `id@version` to the first 16 hex characters of the sha256 of the rendered messages. */
const RECORDED: Record<string, string> = {
  'coverLetter@1': '5c89a7629a96e583',
  'resume@1': 'c10bc876b5742838',
  'resumeMatch@1': '73972db89d3346a5',
  'parseJobDescription@1': 'e357e943306332df',
  'parseCv@1': '8ec90529a7927086',
  'companyBriefing@1': '7c4c434eed86f09d',
  'mockQuestions@1': '0e0a760da2716c36',
  'mockAnswer@1': '3d48115b301bb086',
  'talkingPoints@1': 'ef855303af185aff',
  'chat@1': '7b62802d0559f33f',
};

const actual = Object.fromEntries(RENDERED.map((r) => [keyOf(r), hashOf(r)]));

describe('prompt versions', () => {
  it('gives every prompt a positive whole-number version and a distinct feature', () => {
    for (const { prompt } of RENDERED) {
      expect(
        Number.isInteger(prompt.version) && prompt.version >= 1,
        keyOf({ prompt } as never),
      ).toBe(true);
    }
    const ids = RENDERED.map(({ prompt }) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every AI feature that sends a prompt of ours', () => {
    const covered = new Set(RENDERED.map(({ prompt }) => prompt.id));
    // The key test sends a fixed one-word probe, not a prompt of ours.
    const expected = Object.values(AI_FEATURE).filter((f) => f !== AI_FEATURE.KEY_TEST);
    expect([...covered].sort()).toEqual([...expected].sort());
  });

  it('has a recorded hash for every prompt version', () => {
    const missing = Object.keys(actual).filter((key) => !(key in RECORDED));
    expect(
      missing,
      `Add to RECORDED: ${JSON.stringify(Object.fromEntries(missing.map((k) => [k, actual[k]])))}`,
    ).toEqual([]);
  });

  it('has no recorded hash for a version that no longer exists', () => {
    expect(Object.keys(RECORDED).filter((key) => !(key in actual))).toEqual([]);
  });

  it('changes a prompt’s version whenever its wording changes', () => {
    const changed = Object.keys(actual).filter(
      (key) => key in RECORDED && RECORDED[key] !== actual[key],
    );
    expect(
      changed,
      `The wording of ${changed.join(', ')} changed without a version bump. Bump the prompt's version and record the new hash.`,
    ).toEqual([]);
  });

  it('fences third-party text in every prompt that carries it', () => {
    for (const rendered of RENDERED) {
      const user = rendered.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n');
      if (rendered.prompt.id === AI_FEATURE.CHAT) {
        // Chat fences tool results as they arrive (`formatToolResultForModel`);
        // the prompt states the rule once for all of them.
        const system = rendered.messages.find((m) => m.role === 'system')!.content;
        expect(system).toContain('<tool_result>');
        expect(system).toMatch(/data, not instructions/);
      } else {
        expect(user, keyOf(rendered)).toContain('<untrusted_external_content>');
      }
    }
  });
});
