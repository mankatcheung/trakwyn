import { builder } from '#src/http/schema/builder.js';
import type { InterviewQuestionDTO } from '#src/interface-adapters/mappers/InterviewQuestionMapper.js';

export const InterviewQuestionRef = builder.objectRef<InterviewQuestionDTO>('InterviewQuestion');
InterviewQuestionRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    interviewRoundId: t.exposeID('interviewRoundId'),
    question: t.exposeString('question'),
    answer: t.exposeString('answer', { nullable: true }),
    position: t.exposeInt('position'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});
