import { builder } from '#src/http/schema/builder.js';
import type { DocumentDraftVersionDTO } from '#src/interface-adapters/mappers/DocumentDraftVersionMapper.js';

export const DocumentDraftVersionRef =
  builder.objectRef<DocumentDraftVersionDTO>('DocumentDraftVersion');
DocumentDraftVersionRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    draftId: t.exposeID('draftId'),
    /** `autosave`, `ai`, `manual` or `restore`: why the copy was taken. */
    source: t.exposeString('source'),
    characterCount: t.exposeInt('characterCount'),
    contentJson: t.exposeString('contentJson'),
    plainText: t.exposeString('plainText'),
    createdAt: t.exposeString('createdAt'),
  }),
});
