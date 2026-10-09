import type { ICreateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/ICreateInterviewQuestionUseCase.js';
import type { IGetInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/IGetInterviewQuestionsUseCase.js';
import type { IUpdateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/IUpdateInterviewQuestionUseCase.js';
import type { IDeleteInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/IDeleteInterviewQuestionUseCase.js';
import type { IReorderInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/IReorderInterviewQuestionsUseCase.js';
import type {
  InterviewQuestionMapper,
  InterviewQuestionDTO,
} from '#src/interface-adapters/mappers/InterviewQuestionMapper.js';

interface Deps {
  createInterviewQuestionUseCase: ICreateInterviewQuestionUseCase;
  getInterviewQuestionsUseCase: IGetInterviewQuestionsUseCase;
  updateInterviewQuestionUseCase: IUpdateInterviewQuestionUseCase;
  deleteInterviewQuestionUseCase: IDeleteInterviewQuestionUseCase;
  reorderInterviewQuestionsUseCase: IReorderInterviewQuestionsUseCase;
  interviewQuestionMapper: InterviewQuestionMapper;
}

interface CreateInput {
  roundId: string;
  question: string;
  answer?: string | null;
}

interface UpdateInput {
  question?: string;
  answer?: string | null;
}

export class InterviewQuestionResolver {
  constructor(private readonly deps: Deps) {}

  async getInterviewQuestions(userId: string, roundId: string): Promise<InterviewQuestionDTO[]> {
    const questions = await this.deps.getInterviewQuestionsUseCase.execute({ userId, roundId });
    return questions.map((q) => this.deps.interviewQuestionMapper.toDTO(q));
  }

  async createInterviewQuestion(userId: string, input: CreateInput): Promise<InterviewQuestionDTO> {
    const question = await this.deps.createInterviewQuestionUseCase.execute({ userId, ...input });
    return this.deps.interviewQuestionMapper.toDTO(question);
  }

  async updateInterviewQuestion(
    userId: string,
    questionId: string,
    input: UpdateInput,
  ): Promise<InterviewQuestionDTO> {
    const question = await this.deps.updateInterviewQuestionUseCase.execute({
      userId,
      questionId,
      ...input,
    });
    return this.deps.interviewQuestionMapper.toDTO(question);
  }

  async deleteInterviewQuestion(userId: string, questionId: string): Promise<boolean> {
    await this.deps.deleteInterviewQuestionUseCase.execute({ userId, questionId });
    return true;
  }

  async reorderInterviewQuestions(
    userId: string,
    roundId: string,
    orderedIds: string[],
  ): Promise<InterviewQuestionDTO[]> {
    const questions = await this.deps.reorderInterviewQuestionsUseCase.execute({
      userId,
      roundId,
      orderedIds,
    });
    return questions.map((q) => this.deps.interviewQuestionMapper.toDTO(q));
  }
}
