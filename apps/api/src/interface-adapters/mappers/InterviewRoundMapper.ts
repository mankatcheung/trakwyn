import type { InterviewRound } from '#src/domain/interviewRound/InterviewRound.js';
import type {
  InterviewRoundType,
  InterviewRoundOutcome,
} from '#src/domain/interviewRound/InterviewRound.js';

export interface InterviewRoundDTO {
  id: string;
  applicationId: string;
  type: InterviewRoundType;
  scheduledAt: string | null;
  completedAt: string | null;
  interviewerName: string | null;
  notes: string | null;
  outcome: InterviewRoundOutcome;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export class InterviewRoundMapper {
  toDTO(round: InterviewRound): InterviewRoundDTO {
    return {
      id: round.id,
      applicationId: round.applicationId,
      type: round.type,
      scheduledAt: round.scheduledAt?.toISOString() ?? null,
      completedAt: round.completedAt?.toISOString() ?? null,
      interviewerName: round.interviewerName,
      notes: round.notes,
      outcome: round.outcome,
      questionCount: round.questionCount,
      createdAt: round.createdAt.toISOString(),
      updatedAt: round.updatedAt.toISOString(),
    };
  }
}
