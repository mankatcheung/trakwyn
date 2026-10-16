import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { CreateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/CreateInterviewRoundUseCase.js';
import { GetInterviewRoundsUseCase } from '#src/use-cases/interviewRounds/GetInterviewRoundsUseCase.js';
import { UpdateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/UpdateInterviewRoundUseCase.js';
import { DeleteInterviewRoundUseCase } from '#src/use-cases/interviewRounds/DeleteInterviewRoundUseCase.js';
import { GetInterviewRoundAnalyticsUseCase } from '#src/use-cases/interviewRounds/GetInterviewRoundAnalyticsUseCase.js';

import { CreateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/CreateInterviewQuestionUseCase.js';
import { GetInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/GetInterviewQuestionsUseCase.js';
import { UpdateInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/UpdateInterviewQuestionUseCase.js';
import { DeleteInterviewQuestionUseCase } from '#src/use-cases/interviewQuestions/DeleteInterviewQuestionUseCase.js';
import { ReorderInterviewQuestionsUseCase } from '#src/use-cases/interviewQuestions/ReorderInterviewQuestionsUseCase.js';

import type { Cradle } from '../types.js';

export const interviews = {
  createInterviewRoundUseCase: asClass(CreateInterviewRoundUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getInterviewRoundsUseCase: asClass(GetInterviewRoundsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateInterviewRoundUseCase: asClass(UpdateInterviewRoundUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  deleteInterviewRoundUseCase: asClass(DeleteInterviewRoundUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  createInterviewQuestionUseCase: asClass(CreateInterviewQuestionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getInterviewQuestionsUseCase: asClass(GetInterviewQuestionsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateInterviewQuestionUseCase: asClass(UpdateInterviewQuestionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  deleteInterviewQuestionUseCase: asClass(DeleteInterviewQuestionUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  reorderInterviewQuestionsUseCase: asClass(ReorderInterviewQuestionsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getInterviewRoundAnalyticsUseCase: asClass(GetInterviewRoundAnalyticsUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
