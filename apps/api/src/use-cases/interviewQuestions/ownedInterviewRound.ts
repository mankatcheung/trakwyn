import type { InterviewRound } from '#src/domain/interviewRound/InterviewRound.js';
import { ForbiddenError, NotFoundError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
}

/** Resolves a round and confirms its application belongs to `userId`. */
export async function findOwnedInterviewRound(
  { applicationRepository, interviewRoundRepository }: Deps,
  userId: string,
  roundId: string,
): Promise<InterviewRound> {
  const round = await interviewRoundRepository.findById(roundId);
  if (!round) throw new NotFoundError('Interview round not found');

  const app = await applicationRepository.findById(round.applicationId);
  if (!app || app.userId !== userId) throw new ForbiddenError('Forbidden');

  return round;
}
