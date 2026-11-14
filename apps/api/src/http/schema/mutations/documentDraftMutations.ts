import { GraphQLError } from 'graphql';
import { builder } from '#src/http/schema/builder.js';
import { DocumentDraftRef } from '#src/http/schema/types/DocumentDraftType.js';
import { DocumentRef } from '#src/http/schema/types/DocumentType.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';

const CreateDocumentDraftInput = builder.inputType('CreateDocumentDraftInput', {
  fields: (t) => ({
    applicationId: t.id({ required: true }),
    type: t.string({ required: true }),
    title: t.string({ required: true }),
    contentJson: t.string(),
    plainText: t.string(),
    sourceDocumentId: t.id(),
  }),
});

const UpdateDocumentDraftContentInput = builder.inputType('UpdateDocumentDraftContentInput', {
  fields: (t) => ({
    draftId: t.id({ required: true }),
    contentJson: t.string({ required: true }),
    plainText: t.string({ required: true }),
    aiInstructions: t.string(),
    /** The save carries an AI result replacing the document: keep the content it replaces first (JEF-584). */
    replacedByAi: t.boolean(),
  }),
});

builder.mutationField('createDocumentDraft', (t) =>
  t.field({
    type: DocumentDraftRef,
    args: {
      input: t.arg({ type: CreateDocumentDraftInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      return documentDraftResolver.createDocumentDraft(ctx.user.sub, args.input);
    },
  }),
);

builder.mutationField('updateDocumentDraftContent', (t) =>
  t.field({
    type: DocumentDraftRef,
    args: {
      input: t.arg({ type: UpdateDocumentDraftContentInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      return documentDraftResolver.updateDocumentDraftContent(ctx.user.sub, args.input);
    },
  }),
);

builder.mutationField('renameDocumentDraft', (t) =>
  t.field({
    type: DocumentDraftRef,
    args: {
      draftId: t.arg.id({ required: true }),
      title: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      return documentDraftResolver.renameDocumentDraft(
        ctx.user.sub,
        String(args.draftId),
        args.title,
      );
    },
  }),
);

builder.mutationField('deleteDocumentDraft', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      return documentDraftResolver.deleteDocumentDraft(ctx.user.sub, args.id);
    },
  }),
);

builder.mutationField('exportDocumentDraftToPdf', (t) =>
  t.field({
    type: DocumentRef,
    args: {
      draftId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      return documentDraftResolver.exportDocumentDraftToPdf(ctx.user.sub, args.draftId);
    },
  }),
);

builder.mutationField('extractDocumentText', (t) =>
  t.field({
    type: builder.objectRef<{ text: string }>('ExtractDocumentTextPayload').implement({
      fields: (t) => ({
        text: t.exposeString('text'),
      }),
    }),
    args: {
      documentId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user)
        throw new GraphQLError('Unauthorized', { extensions: { code: ERROR_CODES.UNAUTHORIZED } });
      const { documentDraftResolver } = ctx.diScope.cradle;
      return documentDraftResolver.extractDocumentText(ctx.user.sub, args.documentId);
    },
  }),
);
