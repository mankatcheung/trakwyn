import { meanQuality, scoreResumeQuality } from '#src/evals/judge/resumeQuality.js';
import {
  LABELLED_QUALITY_PAIRS,
  type LabelledQualityPair,
} from '#src/evals/judge/labelledQuality.js';
import { JUDGE_MIN_ACCURACY } from '#src/evals/judge/validateJudge.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

export interface QualityVerdict {
  id: string;
  weakness: string;
  /** The judge's mean score for the strong and the weak resume; null when it could not be read. */
  strongMean: number | null;
  weakMean: number | null;
  correct: boolean;
  error: string | null;
}

export interface QualityValidation {
  verdicts: QualityVerdict[];
  accuracy: number;
  meetsThreshold: boolean;
}

/**
 * The judge is right about a pair when it scores the strong resume strictly
 * higher than the weak one. A tie, a reversal, or a reply that cannot be read
 * is wrong: a judge that cannot tell them apart cannot be used to compare
 * prompt versions. Uses the same floor as the claim-check judge (JEF-599).
 */
export async function validateQualityJudge(
  judge: ILLMProvider,
  pairs: readonly LabelledQualityPair[] = LABELLED_QUALITY_PAIRS,
  minAccuracy: number = JUDGE_MIN_ACCURACY,
): Promise<QualityValidation> {
  const verdicts: QualityVerdict[] = [];

  for (const item of pairs) {
    try {
      const strong = meanQuality(
        await scoreResumeQuality(judge, { source: item.source, resume: item.strong }),
      );
      const weak = meanQuality(
        await scoreResumeQuality(judge, { source: item.source, resume: item.weak }),
      );
      verdicts.push({
        id: item.id,
        weakness: item.weakness,
        strongMean: strong,
        weakMean: weak,
        correct: strong > weak,
        error: null,
      });
    } catch (error: unknown) {
      verdicts.push({
        id: item.id,
        weakness: item.weakness,
        strongMean: null,
        weakMean: null,
        correct: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const right = verdicts.filter((verdict) => verdict.correct).length;
  const accuracy = verdicts.length === 0 ? 0 : right / verdicts.length;
  return { verdicts, accuracy, meetsThreshold: verdicts.length > 0 && accuracy >= minAccuracy };
}

const score = (value: number | null): string => (value === null ? '-' : value.toFixed(2));

export function formatQualityValidation(
  validation: QualityValidation,
  minAccuracy: number,
): string {
  const right = validation.verdicts.filter((verdict) => verdict.correct).length;
  return [
    'Resume quality judge validation',
    ...validation.verdicts.map((verdict) =>
      verdict.error
        ? `  WRONG  ${verdict.id}: ${verdict.error}`
        : `  ${verdict.correct ? 'ok   ' : 'WRONG'}  ${verdict.id}: strong ${score(verdict.strongMean)}, weak ${score(verdict.weakMean)} (${verdict.weakness})`,
    ),
    `accuracy ${right}/${validation.verdicts.length} (${Math.round(validation.accuracy * 100)}%), needs ${Math.round(minAccuracy * 100)}%: ${validation.meetsThreshold ? 'trusted' : 'NOT trusted'}`,
  ].join('\n');
}
