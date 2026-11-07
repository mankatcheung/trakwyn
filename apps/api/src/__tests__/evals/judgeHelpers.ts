import { makeLLMProvider } from '#src/__tests__/helpers/mocks/llm.js';
import type { Claim } from '#src/evals/judge/claimCheck.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

/** A judge that answers every claim check with a fixed list of claims. */
export const judgeSaying = (claims: Claim[]): ILLMProvider =>
  makeLLMProvider(JSON.stringify({ claims }));

/** A judge that finds one claim and supports it. */
export const supportedClaimsJudge = (): ILLMProvider =>
  judgeSaying([
    { text: 'Worked at a listed employer', supported: true, evidence: 'Work Experience' },
  ]);
