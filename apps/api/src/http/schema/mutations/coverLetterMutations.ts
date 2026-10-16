import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { DocumentDraftRef } from '#src/http/schema/types/DocumentDraftType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

// Returns the saved draft rather than the letter as a string: the generated
// text is now persisted (JEF-195), and the client needs its id to open it in
// the editor.
builder.mutationField('generateCoverLetter', (t) =>
  t.field({
    type: DocumentDraftRef,
    args: {
      applicationId: t.arg.id({ required: true }),
      // At most one of the two ids: one of this application's resumes to base
      // the letter on (JEF-396). `resumeText` is for clients that predate it.
      resumeDocumentId: t.arg.id({ required: false }),
      resumeDraftId: t.arg.id({ required: false }),
      resumeText: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      try {
        return await documentDraftResolver.generateCoverLetterDraft(
          ctx.user.sub,
          String(args.applicationId),
          {
            resumeText: args.resumeText,
            resumeDocumentId: args.resumeDocumentId ? String(args.resumeDocumentId) : null,
            resumeDraftId: args.resumeDraftId ? String(args.resumeDraftId) : null,
          },
        );
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
