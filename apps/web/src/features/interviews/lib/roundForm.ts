import { z } from 'zod';
import type { InterviewRound } from '../graphql/interviewRoundQueries';

export const roundSchema = z.object({
  type: z.string(),
  scheduledAt: z.string(),
  interviewerName: z.string(),
  notes: z.string(),
  outcome: z.string(),
});

export type RoundFormState = z.infer<typeof roundSchema>;

export const ROUND_TYPES = ['phone', 'technical', 'onsite', 'hr', 'other'] as const;
export const ROUND_OUTCOMES = ['pending', 'passed', 'failed', 'cancelled'] as const;

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
