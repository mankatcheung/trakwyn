import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IInterviewQuestionRepository } from '#src/use-cases/ports/IInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import type {
  IGetInterviewQuestionsUseCase,
  GetInterviewQuestionsInput,
  GetInterviewQuestionsOutput,
} from '#src/use-cases/interviewQuestions/IGetInterviewQuestionsUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  interviewQuestionRepository: IInterviewQuestionRepository;
}

export class GetInterviewQuestionsUseCase implements IGetInterviewQuestionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetInterviewQuestionsInput): Promise<GetInterviewQuestionsOutput> {
    const round = await findOwnedInterviewRound(this.deps, input.userId, input.roundId);
    return this.deps.interviewQuestionRepository.findAllByRoundId(round.id);
  }
}
