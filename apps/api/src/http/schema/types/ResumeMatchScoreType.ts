import { builder } from '#src/http/schema/builder.js';
import type { ResumeMatchView } from '#src/use-cases/application/ComputeResumeMatchScoreUseCase.js';

export const ResumeMatchRef = builder.objectRef<ResumeMatchView>('ResumeMatch');
ResumeMatchRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    // Exactly one of these is set: the match belongs to a draft or an upload.
    documentDraftId: t.exposeID('documentDraftId', { nullable: true }),
    documentId: t.exposeID('documentId', { nullable: true }),
    score: t.exposeInt('score'),
    label: t.exposeString('label'),
    matchedKeywords: t.exposeStringList('matchedKeywords'),
    missingKeywords: t.exposeStringList('missingKeywords'),
    summary: t.exposeString('summary'),
    generatedAt: t.string({ resolve: (match) => match.generatedAt.toISOString() }),
    // True when the resume's text changed after this match was generated.
    isStale: t.exposeBoolean('isStale'),
  }),
});
