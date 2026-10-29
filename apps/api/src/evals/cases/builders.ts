import { parseJobPosting, scoreResumeMatch } from '#src/evals/harness.js';
import { failuresOf, isPresent, listsDisjoint, type Check } from '#src/evals/cases/matchers.js';
import type { ResumeMatchView } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import type { ParsedJobDescription } from '#src/use-cases/jobDescription/ParseJobDescriptionUseCase.js';
import type { EvalCase } from '#src/evals/types.js';

interface JobPostingSpec {
  id: string;
  posting: string;
  idealReply: ParsedJobDescription;
  expect: (parsed: ParsedJobDescription) => Check[];
}

export function jobPostingCase(spec: JobPostingSpec): EvalCase {
  return {
    id: spec.id,
    feature: 'jobDescription',
    idealReply: JSON.stringify(spec.idealReply),
    run: async (provider) =>
      failuresOf(...spec.expect(await parseJobPosting(provider, spec.posting))),
  };
}

export interface MatchReply {
  matchPercentage: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
}

interface ResumeMatchSpec {
  id: string;
  jobDescription: string;
  resume: string;
  idealReply: MatchReply;
  expect: (match: ResumeMatchView) => Check[];
}

export function resumeMatchCase(spec: ResumeMatchSpec): EvalCase {
  return {
    id: spec.id,
    feature: 'resumeMatch',
    idealReply: JSON.stringify(spec.idealReply),
    run: async (provider) => {
      const match = await scoreResumeMatch(provider, {
        jobDescription: spec.jobDescription,
        resume: spec.resume,
      });
      // The same sanity rules apply to every pairing, whatever its score.
      return failuresOf(
        isPresent('summary', match.summary),
        listsDisjoint(match.matchedKeywords, match.missingKeywords),
        ...spec.expect(match),
      );
    },
  };
}
