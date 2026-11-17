import { z } from 'zod';
import type { InterviewRound } from '../graphql/interviewRoundQueries';

export const ROUND_TYPES = ['phone', 'technical', 'onsite', 'hr', 'other'] as const;
export const ROUND_OUTCOMES = ['pending', 'passed', 'failed', 'cancelled'] as const;

// The selects only offer these values, and they are the API's own enums, so the
// form state is typed as those enums rather than `string`.
export const roundSchema = z.object({
  type: z.enum(ROUND_TYPES),
  scheduledAt: z.string(),
  interviewerName: z.string(),
  notes: z.string(),
  outcome: z.enum(ROUND_OUTCOMES),
});

export type RoundFormState = z.infer<typeof roundSchema>;

export function emptyForm(): RoundFormState {
  return { type: 'phone', scheduledAt: '', interviewerName: '', notes: '', outcome: 'pending' };
}

export function roundToForm(r: InterviewRound): RoundFormState {
  return {
    type: r.type,
    scheduledAt: r.scheduledAt ? r.scheduledAt.slice(0, 16) : '',
    interviewerName: r.interviewerName ?? '',
    notes: r.notes ?? '',
    outcome: r.outcome,
  };
}
