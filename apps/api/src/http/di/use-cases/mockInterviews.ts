import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { CreateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/CreateMockInterviewQuestionUseCase.js';
import { GetMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/GetMockInterviewQuestionsUseCase.js';
import { UpdateMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/UpdateMockInterviewQuestionUseCase.js';
import { DeleteMockInterviewQuestionUseCase } from '#src/use-cases/mockInterviewQuestions/DeleteMockInterviewQuestionUseCase.js';
import { ReorderMockInterviewQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/ReorderMockInterviewQuestionsUseCase.js';
import { GenerateMockQuestionsUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateMockQuestionsUseCase.js';
import { GenerateMockAnswerUseCase } from '#src/use-cases/mockInterviewQuestions/GenerateMockAnswerUseCase.js';

import type { Cradle } from '../types.js';

export const mockInterviews = {
  createMockInterviewQuestionUseCase: asClass(CreateMockInterviewQuestionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getMockInterviewQuestionsUseCase: asClass(GetMockInterviewQuestionsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateMockInterviewQuestionUseCase: asClass(UpdateMockInterviewQuestionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  deleteMockInterviewQuestionUseCase: asClass(DeleteMockInterviewQuestionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  reorderMockInterviewQuestionsUseCase: asClass(ReorderMockInterviewQuestionsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  generateMockQuestionsUseCase: asClass(GenerateMockQuestionsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  generateMockAnswerUseCase: asClass(GenerateMockAnswerUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
