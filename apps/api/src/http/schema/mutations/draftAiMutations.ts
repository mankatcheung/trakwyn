import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

// The AI helper in the resume / cover letter editor (JEF-506). Both return a
// proposal for the editor to show; neither saves anything.

const PolishDocumentDraftResultRef = builder
  .objectRef<{ markdown: string }>('PolishDocumentDraftResult')
  .implement({
    fields: (t) => ({
      markdown: t.exposeString('markdown', { nullable: false }),
    }),
  });

const GeneratedDraftContentRef = builder
  .objectRef<{ contentJson: string; plainText: string }>('GeneratedDraftContent')
  .implement({
    fields: (t) => ({
      contentJson: t.exposeString('contentJson', { nullable: false }),
      plainText: t.exposeString('plainText', { nullable: false }),
    }),
  });

builder.mutationField('polishDocumentDraft', (t) =>
  t.field({
    type: PolishDocumentDraftResultRef,
    nullable: false,
    description:
      'Rewords the text the editor holds (which may be unsaved) and returns it as markdown. Saves nothing.',
    args: {
      draftId: t.arg.id({ required: true }),
      plainText: t.arg.string({ required: true }),
      instructions: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      try {
        return await documentDraftResolver.polishDocumentDraft(ctx.user.sub, {
          draftId: String(args.draftId),
          plainText: args.plainText,
          instructions: args.instructions,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);

builder.mutationField('generateIntoDocumentDraft', (t) =>
  t.field({
    type: GeneratedDraftContentRef,
    nullable: false,
    description:
      'Generates content for an existing draft from the application and the profile. Saves nothing and creates no draft.',
    args: {
      draftId: t.arg.id({ required: true }),
      instructions: t.arg.string({ required: false }),
      // Cover letters only; at most one of the two (JEF-396).
      resumeDocumentId: t.arg.id({ required: false }),
      resumeDraftId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      try {
        return await documentDraftResolver.generateIntoDocumentDraft(ctx.user.sub, {
          draftId: String(args.draftId),
          instructions: args.instructions,
          resumeDocumentId: args.resumeDocumentId ? String(args.resumeDocumentId) : null,
          resumeDraftId: args.resumeDraftId ? String(args.resumeDraftId) : null,
        });
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
