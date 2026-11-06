import { builder } from '#src/http/schema/builder.js';
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
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
  }),
});
