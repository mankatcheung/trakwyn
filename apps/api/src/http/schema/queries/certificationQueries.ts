import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { CertificationRef } from '#src/http/schema/types/CertificationType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('certifications', (t) =>
  t.field({
    type: [CertificationRef],
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { certificationResolver } = ctx.diScope.cradle;
      return certificationResolver.getCertifications(ctx.user.sub);
    },
  }),
);
