import { builder } from '#src/http/schema/builder.js';
import {
  InterviewRoundTypeEnum,
  InterviewRoundOutcomeEnum,
} from '#src/http/schema/types/enums/InterviewRoundEnums.js';
import type { InterviewRoundDTO } from '#src/interface-adapters/mappers/InterviewRoundMapper.js';

export const InterviewRoundRef = builder.objectRef<InterviewRoundDTO>('InterviewRound');
InterviewRoundRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    type: t.expose('type', { type: InterviewRoundTypeEnum }),
    scheduledAt: t.exposeString('scheduledAt', { nullable: true }),
    completedAt: t.exposeString('completedAt', { nullable: true }),
    interviewerName: t.exposeString('interviewerName', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    outcome: t.expose('outcome', { type: InterviewRoundOutcomeEnum }),
    questionCount: t.exposeInt('questionCount'),
    mockQuestionCount: t.exposeInt('mockQuestionCount'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});
