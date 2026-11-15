import {
  generateCoverLetter,
  generateResume,
  parseJobPosting,
  scoreResumeMatch,
} from '#src/evals/harness.js';
import {
  failuresOf,
  isPresent,
  listsDisjoint,
  noForeignLinks,
  type Check,
} from '#src/evals/cases/matchers.js';
import {
  allowedLinkSource,
  claimSource,
  renderResume,
  type GenerationFixture,
} from '#src/evals/fixtures/generationFixture.js';
import { checkClaims, claimFailures } from '#src/evals/judge/claimCheck.js';
import { scoreResumeQuality } from '#src/evals/judge/resumeQuality.js';
import { AiResponseInvalidError } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import type { ResumeMatchView } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';
import type {
  ParsedJobDescription,
  ParsedPostingFields,
} from '#src/use-cases/jobDescription/ParseJobDescriptionUseCase.js';
import type { CaseReport, EvalCase } from '#src/evals/types.js';

interface JobPostingSpec {
  id: string;
  posting: string;
  idealReply: ParsedPostingFields;
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

interface GenerationSpec {
  id: string;
  feature: 'resume' | 'coverLetter';
  fixture: GenerationFixture;
}

/**
 * Scores a resume's quality and puts the numbers in the report (JEF-599). It
 * never fails the case: quality is compared between runs, and a judge reply
 * that cannot be read is reported as "no score" rather than as a bad resume.
 * A provider error (a quota stop, an outage) is let through, as for any call.
 */
async function reportQuality(
  judge: ILLMProvider,
  report: CaseReport | undefined,
  input: { source: string; resume: string },
): Promise<void> {
  try {
    report?.quality(await scoreResumeQuality(judge, input));
  } catch (error: unknown) {
    if (!(error instanceof AiResponseInvalidError)) throw error;
    report?.qualityUnreadable(error.message);
  }
}

/**
 * Passes only when the judge finds every claim in the generated document
 * supported by the fixture (JEF-470) and the document names no link or address
 * the user did not supply (JEF-548). A failure names each one. A resume is also
 * scored for quality (JEF-599), which is reported and never decides pass or fail.
 */
export function generationCase(spec: GenerationSpec): EvalCase {
  const { fixture, feature } = spec;
  return {
    id: spec.id,
    feature,
    idealReply:
      feature === 'resume' ? JSON.stringify(fixture.idealResume) : fixture.idealCoverLetter,
    run: async (provider, judge, report) => {
      if (!judge) {
        throw new Error(`${spec.id} is graded by a judge model, but none was given`);
      }
      const output =
        feature === 'resume'
          ? renderResume(await generateResume(provider, fixture))
          : await generateCoverLetter(provider, fixture);
      const failures = [
        // A link or address the user never entered goes to an employer under their name (JEF-548).
        ...failuresOf(noForeignLinks('document', output, [allowedLinkSource(fixture)])),
        ...claimFailures(await checkClaims(judge, { source: claimSource(fixture), output })),
      ];
      if (feature === 'resume') {
        await reportQuality(judge, report, { source: claimSource(fixture), resume: output });
      }
      return failures;
    },
  };
}
