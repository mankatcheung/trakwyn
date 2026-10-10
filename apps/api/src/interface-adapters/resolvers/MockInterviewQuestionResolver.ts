import type { ICreateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/ICreateMockInterviewQuestionUseCase.js';
import type { IGetMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IGetMockInterviewQuestionsUseCase.js';
import type { IUpdateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/IUpdateMockInterviewQuestionUseCase.js';
import type { IDeleteMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/IDeleteMockInterviewQuestionUseCase.js';
import type { IReorderMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/IReorderMockInterviewQuestionsUseCase.js';
import type {
  MockInterviewQuestionMapper,
  MockInterviewQuestionDTO,
} from '#src/interface-adapters/mappers/MockInterviewQuestionMapper.js';

import type { AnswerSource } from '#src/domain/interviewRound/MockInterviewQuestion.js';
import type {
  IGenerateMockQuestionsUseCase,
  GenerateMockQuestionsOutput,
} from '#src/use-cases/mockInterviewQuestions/IGenerateMockQuestionsUseCase.js';
import type {
  IGenerateMockAnswerUseCase,
  GenerateMockAnswerOutput,
} from '#src/use-cases/mockInterviewQuestions/IGenerateMockAnswerUseCase.js';

interface Deps {
  generateMockQuestionsUseCase: IGenerateMockQuestionsUseCase;
  generateMockAnswerUseCase: IGenerateMockAnswerUseCase;
  createMockInterviewQuestionUseCase: ICreateMockInterviewQuestionUseCase;
  getMockInterviewQuestionsUseCase: IGetMockInterviewQuestionsUseCase;
  updateMockInterviewQuestionUseCase: IUpdateMockInterviewQuestionUseCase;
  deleteMockInterviewQuestionUseCase: IDeleteMockInterviewQuestionUseCase;
  reorderMockInterviewQuestionsUseCase: IReorderMockInterviewQuestionsUseCase;
  mockInterviewQuestionMapper: MockInterviewQuestionMapper;
}

interface CreateInput {
  roundId: string;
  question: string;
  answer?: string | null;
  answerSource?: AnswerSource;
}

interface UpdateInput {
  question?: string;
  answer?: string | null;
  answerSource?: AnswerSource;
}

export class MockInterviewQuestionResolver {
  constructor(private readonly deps: Deps) {}

  async getMockInterviewQuestions(
    userId: string,
    roundId: string,
  ): Promise<MockInterviewQuestionDTO[]> {
    const questions = await this.deps.getMockInterviewQuestionsUseCase.execute({ userId, roundId });
    return questions.map((q) => this.deps.mockInterviewQuestionMapper.toDTO(q));
  }

  async createMockInterviewQuestion(
    userId: string,
    input: CreateInput,
  ): Promise<MockInterviewQuestionDTO> {
    const question = await this.deps.createMockInterviewQuestionUseCase.execute({
      userId,
      ...input,
    });
    return this.deps.mockInterviewQuestionMapper.toDTO(question);
  }

  async updateMockInterviewQuestion(
    userId: string,
    questionId: string,
    input: UpdateInput,
  ): Promise<MockInterviewQuestionDTO> {
    const question = await this.deps.updateMockInterviewQuestionUseCase.execute({
      userId,
      questionId,
      ...input,
    });
    return this.deps.mockInterviewQuestionMapper.toDTO(question);
  }

  async deleteMockInterviewQuestion(userId: string, questionId: string): Promise<boolean> {
    await this.deps.deleteMockInterviewQuestionUseCase.execute({ userId, questionId });
    return true;
  }

  async reorderMockInterviewQuestions(
    userId: string,
    roundId: string,
    orderedIds: string[],
  ): Promise<MockInterviewQuestionDTO[]> {
    const questions = await this.deps.reorderMockInterviewQuestionsUseCase.execute({
      userId,
      roundId,
      orderedIds,
    });
    return questions.map((q) => this.deps.mockInterviewQuestionMapper.toDTO(q));
  }

  generateMockQuestions(
    userId: string,
    input: { roundId: string; prompt?: string; count?: number },
  ): Promise<GenerateMockQuestionsOutput> {
    return this.deps.generateMockQuestionsUseCase.execute({ userId, ...input });
  }

  generateMockAnswer(
    userId: string,
    input: { questionId: string; prompt?: string },
  ): Promise<GenerateMockAnswerOutput> {
    return this.deps.generateMockAnswerUseCase.execute({ userId, ...input });
  }
}
