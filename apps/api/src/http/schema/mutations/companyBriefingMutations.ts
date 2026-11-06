import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { CompanyBriefingRef } from '#src/http/schema/types/CompanyBriefingType.js';
import { fromCodedError } from '#src/http/errors/AppError.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

// Returns the stored briefing rather than a bare string: it is persisted now
// (JEF-195), and the client shows `generatedAt` alongside it.
builder.mutationField('generateCompanyBriefing', (t) =>
  t.field({
    type: CompanyBriefingRef,
    args: {
      applicationId: t.arg.id({ required: true }),
      instructions: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { companyBriefingResolver } = ctx.diScope.cradle;
      try {
        return await companyBriefingResolver.generateCompanyBriefing(
          ctx.user.sub,
          String(args.applicationId),
          args.instructions,
        );
      } catch (err) {
        throw fromCodedError(err);
      }
    },
  }),
);
