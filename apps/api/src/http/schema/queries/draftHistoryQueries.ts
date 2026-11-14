import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { DocumentDraftVersionRef } from '#src/http/schema/types/DocumentDraftVersionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.queryField('documentDraftVersions', (t) =>
  t.field({
    type: [DocumentDraftVersionRef],
    args: { draftId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { draftHistoryResolver } = ctx.diScope.cradle;
      return draftHistoryResolver.getVersions(ctx.user.sub, String(args.draftId));
    },
  }),
);

builder.queryField('documentDraftVersion', (t) =>
  t.field({
    type: DocumentDraftVersionRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { draftHistoryResolver } = ctx.diScope.cradle;
      return draftHistoryResolver.getVersion(ctx.user.sub, String(args.id));
    },
  }),
);
