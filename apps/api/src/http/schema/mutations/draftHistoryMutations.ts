import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { DocumentDraftRef } from '#src/http/schema/types/DocumentDraftType.js';
import { DocumentDraftVersionRef } from '#src/http/schema/types/DocumentDraftVersionType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

builder.mutationField('createDocumentDraftVersion', (t) =>
  t.field({
    type: DocumentDraftVersionRef,
    args: { draftId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { draftHistoryResolver } = ctx.diScope.cradle;
      return draftHistoryResolver.createVersion(ctx.user.sub, String(args.draftId));
    },
  }),
);

builder.mutationField('restoreDocumentDraftVersion', (t) =>
  t.field({
    type: DocumentDraftRef,
    args: { versionId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { draftHistoryResolver } = ctx.diScope.cradle;
      return draftHistoryResolver.restoreVersion(ctx.user.sub, String(args.versionId));
    },
  }),
);
