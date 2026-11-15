import { builder } from '#src/http/schema/builder.js';
import type { ResumeGaps, RoleWithoutMetrics } from '#src/use-cases/resume/resumeGaps.js';

const RoleWithoutMetricsRef = builder.objectRef<RoleWithoutMetrics>('RoleWithoutMetrics');
RoleWithoutMetricsRef.implement({
  description: 'A work experience whose description holds no number.',
  fields: (t) => ({
    workExperienceId: t.exposeID('workExperienceId'),
    company: t.exposeString('company'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
  }),
});

export const ResumeGapsRef = builder.objectRef<ResumeGaps>('ResumeGaps');
ResumeGapsRef.implement({
  description:
    'Questions that would strengthen a resume for an application: what the posting asks for that the profile does not show, and roles with no numbers.',
  fields: (t) => ({
    requirementsRead: t.exposeBoolean('requirementsRead', {
      description: 'False when the posting’s requirements have not been read yet.',
    }),
    requirementGaps: t.exposeStringList('requirementGaps'),
    rolesWithoutMetrics: t.field({
      type: [RoleWithoutMetricsRef],
      resolve: (gaps) => gaps.rolesWithoutMetrics,
    }),
  }),
});
