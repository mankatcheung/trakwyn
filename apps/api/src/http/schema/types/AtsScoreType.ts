import { builder } from '#src/http/schema/builder.js';
import type { AtsCheck, AtsScoreResult } from '#src/domain/resume/AtsScore.js';

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

export const AtsScoreRef = builder.objectRef<AtsScoreResult>('AtsScore');
AtsScoreRef.implement({
  fields: (t) => ({
    score: t.exposeInt('score'),
    label: t.exposeString('label'),
    // False for a scan or an image: nothing could be read, so nothing else is judged.
    readable: t.exposeBoolean('readable'),
    checks: t.field({ type: [AtsCheckRef], resolve: (result) => [...result.checks] }),
  }),
});
