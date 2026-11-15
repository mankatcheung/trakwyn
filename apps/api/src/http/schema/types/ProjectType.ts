import { builder } from '#src/http/schema/builder.js';
import type { ProjectDTO } from '#src/interface-adapters/mappers/ProjectMapper.js';

export const ProjectRef = builder.objectRef<ProjectDTO>('Project');
ProjectRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeID('userId'),
    name: t.exposeString('name'),
    role: t.exposeString('role', { nullable: true }),
    url: t.exposeString('url', { nullable: true }),
    startDate: t.exposeString('startDate', { nullable: true }),
    endDate: t.exposeString('endDate', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
  }),
});
