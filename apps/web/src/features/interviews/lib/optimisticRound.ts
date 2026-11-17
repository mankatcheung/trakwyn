import type { InterviewRound } from '../graphql/interviewRoundQueries';
import type { RoundFormState } from './roundForm';

/** Ids of rounds that exist only in the cache until the server answers. */
export const OPTIMISTIC_ROUND_ID_PREFIX = '__tmp_';

/** A round the list is showing before the server has created it. */
export function isOptimisticRound(round: Pick<InterviewRound, 'id'>): boolean {
  return round.id.startsWith(OPTIMISTIC_ROUND_ID_PREFIX);
}

/**
 * The round the list shows while a create is in flight: what the form holds,
 * with no questions yet. It lives here, not in the component, because it reads
 * the clock and a component must not.
 */
export function buildOptimisticRound(
  applicationId: string,
  form: RoundFormState,
  now: Date = new Date(),
): InterviewRound {
  const timestamp = now.toISOString();
  return {
    id: `${OPTIMISTIC_ROUND_ID_PREFIX}${now.getTime()}`,
    applicationId,
    type: form.type,
    scheduledAt: form.scheduledAt || null,
    completedAt: null,
    interviewerName: form.interviewerName || null,
    notes: form.notes || null,
    outcome: form.outcome,
    questionCount: 0,
    mockQuestionCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
