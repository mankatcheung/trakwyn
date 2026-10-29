import type { McpActor } from '#src/use-cases/shared/mcpActor.js';
import type {
  InterviewRound,
  InterviewRoundType,
  InterviewRoundOutcome,
} from '#src/domain/interviewRound/InterviewRound.js';

export interface CreateInterviewRoundInput {
  userId: string;
  applicationId: string;
  type?: InterviewRoundType;
  scheduledAt?: Date | null;
  completedAt?: Date | null;
  interviewerName?: string | null;
  notes?: string | null;
  outcome?: InterviewRoundOutcome;
  /** Set when an MCP client made the change; recorded in the activity log. */
  actor?: McpActor;
}

export type CreateInterviewRoundOutput = InterviewRound;

export interface ICreateInterviewRoundUseCase {
  execute(input: CreateInterviewRoundInput): Promise<CreateInterviewRoundOutput>;
}
