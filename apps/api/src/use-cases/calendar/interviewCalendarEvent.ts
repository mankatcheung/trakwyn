import type { Application } from '#src/domain/application/Application.js';
import type { InterviewRound } from '#src/domain/interviewRound/InterviewRound.js';
import type { CalendarEventData } from '#src/use-cases/ports/ICalendarProvider.js';
import { CALENDAR_SYNC } from '#src/use-cases/constants.js';

/**
 * The Google event an interview round maps to, or `null` when it has no
 * `scheduledAt` (which tells the sync to remove any event it already made).
 * Shared by create and update so the two cannot drift apart.
 */
export function interviewCalendarEvent(
  app: Pick<Application, 'company' | 'role'>,
  round: Pick<InterviewRound, 'scheduledAt' | 'notes'>,
): CalendarEventData | null {
  if (!round.scheduledAt) return null;
  return {
    title: `Interview: ${app.company} — ${app.role}`,
    description: round.notes,
    startAt: round.scheduledAt,
    endAt: new Date(round.scheduledAt.getTime() + CALENDAR_SYNC.INTERVIEW_DURATION_MS),
  };
}
