import { builder } from '#src/http/schema/builder.js';
import type { MockInterviewQuestionDTO } from '#src/interface-adapters/mappers/MockInterviewQuestionMapper.js';

export const AnswerSourceEnum = builder.enumType('AnswerSource', {
  values: {
    user: { value: 'user' },
    ai: { value: 'ai' },
  },
});

export const MockInterviewQuestionRef =
  builder.objectRef<MockInterviewQuestionDTO>('MockInterviewQuestion');
MockInterviewQuestionRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    interviewRoundId: t.exposeID('interviewRoundId'),
    question: t.exposeString('question'),
    answer: t.exposeString('answer', { nullable: true }),
    answerSource: t.field({ type: AnswerSourceEnum, resolve: (q) => q.answerSource }),
    position: t.exposeInt('position'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});
