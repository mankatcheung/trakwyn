import { TRASH } from '#src/use-cases/constants.js';
import { builder } from '#src/http/schema/builder.js';
import { ApplicationSectionCountsRef } from '#src/http/schema/types/ApplicationSectionCountsType.js';
import { ApplicationStatusEnum } from '#src/http/schema/types/enums/ApplicationStatusEnum.js';
import type { ApplicationDTO } from '#src/interface-adapters/mappers/ApplicationMapper.js';

export const JobApplicationRef = builder.objectRef<ApplicationDTO>('JobApplication');
JobApplicationRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    userId: t.exposeID('userId'),
    company: t.exposeString('company'),
    role: t.exposeString('role'),
    status: t.expose('status', { type: ApplicationStatusEnum }),
    jobUrl: t.exposeString('jobUrl', { nullable: true }),
    location: t.exposeString('location', { nullable: true }),
    salaryRange: t.exposeString('salaryRange', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    postingText: t.exposeString('postingText', {
      nullable: true,
      description:
        'The full job posting text, when captured. AI features read it in preference to the description.',
    }),
    appliedAt: t.exposeString('appliedAt', { nullable: true }),
    starred: t.exposeBoolean('starred'),
    source: t.exposeString('source', { nullable: true }),
    followUpAt: t.exposeString('followUpAt', { nullable: true }),
    tags: t.exposeStringList('tags'),
    boardPosition: t.exposeInt('boardPosition'),
    createdAt: t.exposeString('createdAt'),
    updatedAt: t.exposeString('updatedAt'),
    deletedAt: t.exposeString('deletedAt', { nullable: true }),
    // Derived server-side so the retention window has exactly one definition.
    // The Trash screen counts down to this instant; if TRASH.RETENTION_MS ever
    // changes, no client needs to be redeployed to agree with the purge job.
    purgeAt: t.string({
      nullable: true,
      resolve: (app) =>
        app.deletedAt
          ? new Date(new Date(app.deletedAt).getTime() + TRASH.RETENTION_MS).toISOString()
          : null,
    }),
    likelyGhosted: t.exposeBoolean('likelyGhosted'),
    // Resolved on demand: six COUNT(*)s that only the detail page asks for,
    // so list and board queries never pay for them.
    sectionCounts: t.field({
      type: ApplicationSectionCountsRef,
      resolve: async (app, _args, ctx) => {
        if (!ctx.user) throw new Error('Unauthorized');
        const { getApplicationSectionCountsUseCase } = ctx.diScope.cradle;
        return getApplicationSectionCountsUseCase.execute({
          userId: ctx.user.sub,
          applicationId: app.id,
        });
      },
    }),
  }),
});
