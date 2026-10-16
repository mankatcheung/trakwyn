import { ValidationError } from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IInterviewRoundRepository } from '#src/use-cases/ports/IInterviewRoundRepository.js';
import type { IMockInterviewQuestionRepository } from '#src/use-cases/ports/IMockInterviewQuestionRepository.js';
import { findOwnedInterviewRound } from '#src/use-cases/interviewQuestions/ownedInterviewRound.js';
import type {
  IReorderMockInterviewQuestionsUseCase,
  ReorderMockInterviewQuestionsInput,
  ReorderMockInterviewQuestionsOutput,
} from '#src/use-cases/mockInterviewQuestions/IReorderMockInterviewQuestionsUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  interviewRoundRepository: IInterviewRoundRepository;
  mockInterviewQuestionRepository: IMockInterviewQuestionRepository;
}

export class ReorderMockInterviewQuestionsUseCase implements IReorderMockInterviewQuestionsUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: ReorderMockInterviewQuestionsInput,
  ): Promise<ReorderMockInterviewQuestionsOutput> {
    const round = await findOwnedInterviewRound(this.deps, input.userId, input.roundId);

    const current = await this.deps.mockInterviewQuestionRepository.findAllByRoundId(round.id);
    const currentIds = new Set(current.map((q) => q.id));
    const requested = new Set(input.orderedIds);

    // A partial or foreign list would leave positions ambiguous, so it must be
    // exactly this round's questions, each once.
    const isPermutation =
      requested.size === input.orderedIds.length &&
      requested.size === currentIds.size &&
      input.orderedIds.every((id) => currentIds.has(id));
    if (!isPermutation) {
      throw new ValidationError('Reorder must list every question in the round exactly once');
    }

    await this.deps.mockInterviewQuestionRepository.reorder(round.id, input.orderedIds);
    return this.deps.mockInterviewQuestionRepository.findAllByRoundId(round.id);
  }
}
