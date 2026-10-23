import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { DocumentRef } from '#src/http/schema/types/DocumentType.js';
import { UploadUrlPayloadRef } from '#src/http/schema/types/AuthPayloadType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import {
  RequestUploadUrlInput,
  ConfirmDocumentInput,
} from '#src/http/schema/types/inputs/DocumentInputs.js';

builder.mutationField('requestUploadUrl', (t) =>
  t.field({
    type: UploadUrlPayloadRef,
    args: {
      input: t.arg({ type: RequestUploadUrlInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentResolver } = ctx.diScope.cradle;
      return documentResolver.requestUploadUrl(
        ctx.user.sub,
        args.input.applicationId,
        args.input.filename,
        args.input.mimeType,
        args.input.sizeBytes ?? undefined,
      );
    },
  }),
);

builder.mutationField('confirmDocument', (t) =>
  t.field({
    type: DocumentRef,
    args: {
      input: t.arg({ type: ConfirmDocumentInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentResolver } = ctx.diScope.cradle;
      return documentResolver.confirmDocument(ctx.user.sub, {
        applicationId: args.input.applicationId,
        storageKey: args.input.storageKey,
        name: args.input.name,
        mimeType: args.input.mimeType,
        sizeBytes: args.input.sizeBytes,
        documentType: args.input.documentType ?? undefined,
        version: args.input.version ?? null,
      });
    },
  }),
);

builder.mutationField('deleteDocument', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentResolver } = ctx.diScope.cradle;
      return documentResolver.deleteDocument(ctx.user.sub, args.id);
    },
  }),
);
