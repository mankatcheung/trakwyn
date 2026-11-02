import { builder } from '#src/http/schema/builder.js';
import type {
  ContentQuota,
  ContentQuotaLimits,
  ContentQuotaUsage,
} from '#src/use-cases/quotas/GetContentQuotaUseCase.js';

const ContentQuotaLimitsRef = builder.objectRef<ContentQuotaLimits>('ContentQuotaLimits');
ContentQuotaLimitsRef.implement({
  description:
    'The most a user may hold of each resource, and the longest a free-text field may be. The same for every plan (JEF-339).',
  fields: (t) => ({
    notesPerApplication: t.exposeInt('notesPerApplication'),
    contactsPerApplication: t.exposeInt('contactsPerApplication'),
    interviewRoundsPerApplication: t.exposeInt('interviewRoundsPerApplication'),
    offersPerApplication: t.exposeInt('offersPerApplication'),
    tagsPerApplication: t.exposeInt('tagsPerApplication'),
    documentDraftsPerApplication: t.exposeInt('documentDraftsPerApplication'),
    conversationsPerUser: t.exposeInt('conversationsPerUser'),
    workExperiencesPerUser: t.exposeInt('workExperiencesPerUser'),
    educationsPerUser: t.exposeInt('educationsPerUser'),
    skillsPerUser: t.exposeInt('skillsPerUser'),
    shareLinksPerUser: t.exposeInt('shareLinksPerUser'),
    apiTokensPerUser: t.exposeInt('apiTokensPerUser'),
    pushSubscriptionsPerUser: t.exposeInt('pushSubscriptionsPerUser'),
    expoPushTokensPerUser: t.exposeInt('expoPushTokensPerUser'),
    messagesPerConversation: t.exposeInt('messagesPerConversation', {
      description: 'Past this the oldest messages are removed to make room.',
    }),
    noteContentMaxLength: t.exposeInt('noteContentMaxLength'),
    tagNameMaxLength: t.exposeInt('tagNameMaxLength'),
  }),
});

const ContentQuotaUsageRef = builder.objectRef<ContentQuotaUsage>('ContentQuotaUsage');
ContentQuotaUsageRef.implement({
  description:
    'What the user holds of each per-user resource. Per-application counts are on Application.sectionCounts and Application.tags.',
  fields: (t) => ({
    conversations: t.exposeInt('conversations'),
    workExperiences: t.exposeInt('workExperiences'),
    educations: t.exposeInt('educations'),
    skills: t.exposeInt('skills'),
    shareLinks: t.exposeInt('shareLinks'),
    apiTokens: t.exposeInt('apiTokens'),
    pushSubscriptions: t.exposeInt('pushSubscriptions'),
    expoPushTokens: t.exposeInt('expoPushTokens'),
  }),
});

export const ContentQuotaRef = builder.objectRef<ContentQuota>('ContentQuota');
ContentQuotaRef.implement({
  fields: (t) => ({
    limits: t.field({ type: ContentQuotaLimitsRef, resolve: (quota) => quota.limits }),
    usage: t.field({ type: ContentQuotaUsageRef, resolve: (quota) => quota.usage }),
  }),
});
