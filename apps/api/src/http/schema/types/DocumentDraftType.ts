import { builder } from '#src/http/schema/builder.js';
import { AiRatingRef } from '#src/http/schema/types/AiRatingType.js';
import { toAiRatingDTO } from '#src/interface-adapters/mappers/AiRatingMapper.js';
import { AI_FEEDBACK_TARGET } from '#src/use-cases/constants.js';
import type { DocumentDraftDTO } from '#src/interface-adapters/mappers/DocumentDraftMapper.js';

export const DocumentDraftRef = builder.objectRef<DocumentDraftDTO>('DocumentDraft');
DocumentDraftRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    applicationId: t.exposeID('applicationId'),
    type: t.exposeString('type'),
    title: t.exposeString('title'),
    contentJson: t.exposeString('contentJson'),
    plainText: t.exposeString('plainText'),
    sourceDocumentId: t.exposeString('sourceDocumentId', { nullable: true }),
    aiInstructions: t.exposeString('aiInstructions', { nullable: true }),
    aiGenerated: t.exposeBoolean('aiGenerated'),
    /**
     * The caller's own rating of the draft's AI generation (JEF-547). One lookup
     * per draft, so ask for it on the single-draft query, not on a list.
     */
    myRating: t.field({
      type: AiRatingRef,
      nullable: true,
      resolve: async (draft, _args, ctx) => {
        if (!ctx.user || !draft.aiGenerated) return null;
        const [rating] = await ctx.diScope.cradle.getAiOutputRatingsUseCase.execute({
          userId: ctx.user.sub,
          targetKind: AI_FEEDBACK_TARGET.DOCUMENT_DRAFT,
          targetIds: [draft.id],
        });
        return toAiRatingDTO(rating);
      },
    }),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});
