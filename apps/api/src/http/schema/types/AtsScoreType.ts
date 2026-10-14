import { builder } from '#src/http/schema/builder.js';
import type { AtsCheck } from '#src/domain/resume/AtsScore.js';
import type { AtsScoreView } from '#src/use-cases/application/ComputeResumeAtsScoreUseCase.js';

export const AtsCheckRef = builder.objectRef<AtsCheck>('AtsCheck');
AtsCheckRef.implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    label: t.exposeString('label'),
    passed: t.exposeBoolean('passed'),
    points: t.exposeInt('points'),
    maxPoints: t.exposeInt('maxPoints'),
    hint: t.exposeString('hint'),
  }),
});

export const AtsScoreRef = builder.objectRef<AtsScoreView>('AtsScore');
AtsScoreRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    // Exactly one of these is set: the result belongs to a draft or an upload.
    documentDraftId: t.exposeID('documentDraftId', { nullable: true }),
    documentId: t.exposeID('documentId', { nullable: true }),
    score: t.exposeInt('score'),
    label: t.exposeString('label'),
    // False for a scan or an image: nothing could be read, so nothing else is judged.
    readable: t.exposeBoolean('readable'),
    checks: t.field({ type: [AtsCheckRef], resolve: (result) => [...result.checks] }),
    generatedAt: t.string({ resolve: (result) => result.generatedAt.toISOString() }),
    // True when the resume's text changed after this result was scored.
    isStale: t.exposeBoolean('isStale'),
  }),
});
