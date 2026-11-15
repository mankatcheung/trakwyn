import { builder } from '#src/http/schema/builder.js';
import type { AwardDTO } from '#src/interface-adapters/mappers/AwardMapper.js';

export const AwardRef = builder.objectRef<AwardDTO>('Award');
AwardRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeID('userId'),
    title: t.exposeString('title'),
    issuer: t.exposeString('issuer', { nullable: true }),
    date: t.exposeString('date', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
  }),
});
