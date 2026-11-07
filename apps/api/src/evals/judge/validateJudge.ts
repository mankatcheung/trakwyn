import { checkClaims, unsupportedClaims } from '#src/evals/judge/claimCheck.js';
import { LABELLED_OUTPUTS, type LabelledOutput } from '#src/evals/judge/labelled.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

/** Share of the labelled outputs the judge must classify correctly before its scores count. */
export const JUDGE_MIN_ACCURACY = 0.9;

export interface JudgeVerdict {
  id: string;
  label: LabelledOutput['label'];
  correct: boolean;
  /** The claims the judge called unsupported, to see what it saw or missed. */
  flagged: string[];
  error: string | null;
}

export interface JudgeValidation {
  verdicts: JudgeVerdict[];
  accuracy: number;
  meetsThreshold: boolean;
}

/**
 * A faithful output is right when the judge flags nothing; a fabricated one
 * when it flags at least one claim. A judge that lists no claims at all, or
 * whose reply cannot be read, is wrong: it cannot be trusted to score.
 */
export async function validateJudge(
  judge: ILLMProvider,
  outputs: readonly LabelledOutput[] = LABELLED_OUTPUTS,
  minAccuracy: number = JUDGE_MIN_ACCURACY,
): Promise<JudgeValidation> {
  const verdicts: JudgeVerdict[] = [];

  for (const item of outputs) {
    try {
      const claims = await checkClaims(judge, { source: item.source, output: item.output });
      const flagged = unsupportedClaims(claims).map((claim) => claim.text);
      const rightAnswer = item.label === 'fabricated' ? flagged.length > 0 : flagged.length === 0;
      verdicts.push({
        id: item.id,
        label: item.label,
        correct: claims.length > 0 && rightAnswer,
        flagged,
        error: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      verdicts.push({
        id: item.id,
        label: item.label,
        correct: false,
        flagged: [],
        error: message,
      });
    }
  }

  const right = verdicts.filter((verdict) => verdict.correct).length;
  const accuracy = verdicts.length === 0 ? 0 : right / verdicts.length;
  return { verdicts, accuracy, meetsThreshold: verdicts.length > 0 && accuracy >= minAccuracy };
}

function detail(verdict: JudgeVerdict): string {
  if (verdict.error) return `: ${verdict.error}`;
  if (verdict.flagged.length === 0) return '';
  return `: flagged ${verdict.flagged.map((claim) => `"${claim}"`).join(', ')}`;
}

export function formatValidation(validation: JudgeValidation, minAccuracy: number): string {
  const right = validation.verdicts.filter((verdict) => verdict.correct).length;
  return [
    'Judge validation',
    ...validation.verdicts.map(
      (verdict) =>
        `  ${verdict.correct ? 'ok   ' : 'WRONG'}  ${verdict.id} (${verdict.label})${detail(verdict)}`,
    ),
    `accuracy ${right}/${validation.verdicts.length} (${Math.round(validation.accuracy * 100)}%), needs ${Math.round(minAccuracy * 100)}%: ${validation.meetsThreshold ? 'trusted' : 'NOT trusted'}`,
  ].join('\n');
}
