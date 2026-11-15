import { builder } from '#src/http/schema/builder.js';
import type { LanguageDTO } from '#src/interface-adapters/mappers/LanguageMapper.js';

export const LanguageRef = builder.objectRef<LanguageDTO>('Language');
LanguageRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeID('userId'),
    name: t.exposeString('name'),
    proficiency: t.exposeString('proficiency', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
  }),
});
