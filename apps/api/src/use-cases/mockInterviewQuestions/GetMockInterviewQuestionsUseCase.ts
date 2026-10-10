import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import type {
  IGetMockInterviewQuestionsUseCase,
  GetMockInterviewQuestionsInput,
  GetMockInterviewQuestionsOutput,
} from '#src/use-cases/mockInterviewQuestions/IGetMockInterviewQuestionsUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
}

export class GetMockInterviewQuestionsUseCase implements IGetMockInterviewQuestionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetMockInterviewQuestionsInput): Promise<GetMockInterviewQuestionsOutput> {
    const round = await findOwnedInterviewRound(this.deps, input.userId, input.roundId);
    return this.deps.mockInterviewQuestionRepository.findAllByRoundId(round.id);
  }
}
