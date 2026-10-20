import type { AiParsedJob } from '../api';
import type { JobData } from './types';

type MergeField = 'company' | 'role' | 'location' | 'description';

export interface MergedJob {
  jobData: JobData;
  /** The fields the AI supplied, so the popup can ask the user to confirm them. */
  filled: MergeField[];
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Combines the built-in parser's result with the AI's (JEF-420). The AI fills
 * only what the built-in parser left empty, so a good parse is never replaced
 * by a model's guess, and a null AI field never blanks a parsed one.
 * `page` supplies `jobUrl` and `source` when the built-in parser found nothing.
 */
export function mergeAiResult(
  builtin: JobData | null,
  ai: AiParsedJob,
  page: Pick<JobData, 'jobUrl' | 'source'>,
): MergedJob {
  const filled: MergeField[] = [];
  const pick = (field: MergeField): string | undefined => {
    const parsed = builtin?.[field];
    if (present(parsed)) return parsed;
    const suggested = ai[field];
    if (!present(suggested)) return undefined;
    filled.push(field);
    return suggested.trim();
  };

  return {
    jobData: {
      company: pick('company') ?? '',
      role: pick('role') ?? '',
      location: pick('location'),
      description: pick('description'),
      jobUrl: builtin?.jobUrl ?? page.jobUrl,
      source: builtin?.source ?? page.source,
    },
    filled,
  };
}
