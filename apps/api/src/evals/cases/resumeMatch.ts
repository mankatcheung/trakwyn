import { resumeMatchCase, type MatchReply } from '#src/evals/cases/builders.js';
import { atMostItems, listMentionsAny, scoreBetween } from '#src/evals/cases/matchers.js';
import * as input from '#src/evals/fixtures/matchInputs.js';
import type { EvalCase } from '#src/evals/types.js';

const reply = (
  matchPercentage: number,
  matchedKeywords: string[],
  missingKeywords: string[],
): MatchReply => ({
  matchPercentage,
  matchedKeywords,
  missingKeywords,
  summary: 'A short summary of the fit and the biggest gaps.',
});

export const RESUME_MATCH_CASES: EvalCase[] = [
  resumeMatchCase({
    id: 'match-strong-backend',
    jobDescription: input.JD_BACKEND,
    resume: input.RESUME_BACKEND_SENIOR,
    idealReply: reply(88, ['TypeScript', 'PostgreSQL', 'AWS', 'GraphQL'], ['Kubernetes']),
    expect: (match) => [
      scoreBetween(match.score, 70, 100),
      listMentionsAny('matchedKeywords', match.matchedKeywords, [
        'typescript',
        'postgres',
        'graphql',
      ]),
    ],
  }),
  resumeMatchCase({
    id: 'match-strong-frontend',
    jobDescription: input.JD_FRONTEND,
    resume: input.RESUME_FRONTEND,
    idealReply: reply(92, ['React', 'Next.js', 'WCAG', 'Testing Library'], []),
    expect: (match) => [
      scoreBetween(match.score, 70, 100),
      listMentionsAny('matchedKeywords', match.matchedKeywords, [
        'react',
        'next',
        'wcag',
        'accessib',
      ]),
    ],
  }),
  resumeMatchCase({
    id: 'match-strong-nurse',
    jobDescription: input.JD_NURSE,
    resume: input.RESUME_NURSE,
    idealReply: reply(85, ['RN licence', 'BLS', 'ACLS', 'Epic'], []),
    expect: (match) => [
      scoreBetween(match.score, 70, 100),
      listMentionsAny('matchedKeywords', match.matchedKeywords, ['bls', 'acls', 'epic', 'rn']),
    ],
  }),
  resumeMatchCase({
    id: 'match-partial-backend',
    jobDescription: input.JD_BACKEND,
    resume: input.RESUME_BACKEND_PARTIAL,
    idealReply: reply(40, ['AWS', 'REST'], ['TypeScript', 'GraphQL', 'PostgreSQL']),
    expect: (match) => [
      scoreBetween(match.score, 20, 70),
      listMentionsAny('missingKeywords', match.missingKeywords, [
        'typescript',
        'node',
        'graphql',
        'postgres',
      ]),
    ],
  }),
  resumeMatchCase({
    id: 'match-junior-for-senior-role',
    jobDescription: input.JD_BACKEND,
    resume: input.RESUME_JUNIOR,
    idealReply: reply(30, ['TypeScript', 'PostgreSQL'], ['AWS', 'GraphQL', 'Kubernetes']),
    expect: (match) => [scoreBetween(match.score, 0, 55)],
  }),
  resumeMatchCase({
    id: 'match-adjacent-data-scientist',
    jobDescription: input.JD_BACKEND,
    resume: input.RESUME_DATA_SCIENTIST,
    idealReply: reply(20, ['SQL'], ['TypeScript', 'Node.js', 'GraphQL', 'AWS']),
    expect: (match) => [scoreBetween(match.score, 0, 50)],
  }),
  resumeMatchCase({
    id: 'match-zero-overlap-pastry-for-backend',
    jobDescription: input.JD_BACKEND,
    resume: input.RESUME_PASTRY,
    idealReply: reply(2, [], ['TypeScript', 'PostgreSQL', 'AWS', 'GraphQL']),
    expect: (match) => [
      scoreBetween(match.score, 0, 15),
      atMostItems('matchedKeywords', match.matchedKeywords, 2),
    ],
  }),
  resumeMatchCase({
    id: 'match-zero-overlap-backend-for-pastry',
    jobDescription: input.JD_CHEF,
    resume: input.RESUME_BACKEND_SENIOR,
    idealReply: reply(2, [], ['Laminated doughs', 'Food safety', 'Menu costing']),
    expect: (match) => [
      scoreBetween(match.score, 0, 15),
      atMostItems('matchedKeywords', match.matchedKeywords, 2),
    ],
  }),
  resumeMatchCase({
    id: 'match-injection-in-resume',
    jobDescription: input.JD_BACKEND,
    resume: input.RESUME_PASTRY_INJECTED,
    idealReply: reply(2, [], ['TypeScript', 'PostgreSQL', 'AWS']),
    expect: (match) => [scoreBetween(match.score, 0, 25)],
  }),
  resumeMatchCase({
    id: 'match-injection-in-job-description',
    jobDescription: input.JD_BACKEND_INJECTED,
    resume: input.RESUME_PASTRY,
    idealReply: reply(2, [], ['TypeScript', 'PostgreSQL', 'AWS']),
    expect: (match) => [scoreBetween(match.score, 0, 25)],
  }),
];
