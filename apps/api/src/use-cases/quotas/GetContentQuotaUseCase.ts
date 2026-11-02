import { CONTENT_LIMITS, FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';
import type { IApiTokenRepository } from '#src/use-cases/ports/IApiTokenRepository.js';
import type { IConversationRepository } from '#src/use-cases/ports/IConversationRepository.js';
import type { IEducationRepository } from '#src/use-cases/ports/IEducationRepository.js';
import type { IPushSubscriptionRepository } from '#src/use-cases/ports/IPushSubscriptionRepository.js';
import type { IShareLinkRepository } from '#src/use-cases/ports/IShareLinkRepository.js';
import type { ISkillRepository } from '#src/use-cases/ports/ISkillRepository.js';
import type { IWorkExperienceRepository } from '#src/use-cases/ports/IWorkExperienceRepository.js';

interface Deps {
  skillRepository: ISkillRepository;
  workExperienceRepository: IWorkExperienceRepository;
  educationRepository: IEducationRepository;
  conversationRepository: IConversationRepository;
  shareLinkRepository: IShareLinkRepository;
  apiTokenRepository: IApiTokenRepository;
  pushSubscriptionRepository: IPushSubscriptionRepository;
}

export interface GetContentQuotaInput {
  userId: string;
}

/** The ceiling on every resource capped by JEF-339, the same for every user. */
export interface ContentQuotaLimits {
  notesPerApplication: number;
  contactsPerApplication: number;
  interviewRoundsPerApplication: number;
  offersPerApplication: number;
  tagsPerApplication: number;
  documentDraftsPerApplication: number;
  conversationsPerUser: number;
  workExperiencesPerUser: number;
  educationsPerUser: number;
  skillsPerUser: number;
  shareLinksPerUser: number;
  apiTokensPerUser: number;
  pushSubscriptionsPerUser: number;
  expoPushTokensPerUser: number;
  messagesPerConversation: number;
  noteContentMaxLength: number;
  tagNameMaxLength: number;
}

/**
 * What the user holds of the per-user resources. The per-application counts are
 * already on `Application.sectionCounts` and `Application.tags`, so only these
 * need a call of their own.
 */
export interface ContentQuotaUsage {
  conversations: number;
  workExperiences: number;
  educations: number;
  skills: number;
  shareLinks: number;
  apiTokens: number;
  pushSubscriptions: number;
  expoPushTokens: number;
}

export interface ContentQuota {
  limits: ContentQuotaLimits;
  usage: ContentQuotaUsage;
}

export const CONTENT_QUOTA_LIMITS: ContentQuotaLimits = {
  notesPerApplication: CONTENT_LIMITS.NOTES_PER_APPLICATION,
  contactsPerApplication: CONTENT_LIMITS.CONTACTS_PER_APPLICATION,
  interviewRoundsPerApplication: CONTENT_LIMITS.INTERVIEW_ROUNDS_PER_APPLICATION,
  offersPerApplication: CONTENT_LIMITS.OFFERS_PER_APPLICATION,
  tagsPerApplication: CONTENT_LIMITS.TAGS_PER_APPLICATION,
  documentDraftsPerApplication: CONTENT_LIMITS.DOCUMENT_DRAFTS_PER_APPLICATION,
  conversationsPerUser: CONTENT_LIMITS.CONVERSATIONS_PER_USER,
  workExperiencesPerUser: CONTENT_LIMITS.WORK_EXPERIENCES_PER_USER,
  educationsPerUser: CONTENT_LIMITS.EDUCATIONS_PER_USER,
  skillsPerUser: CONTENT_LIMITS.SKILLS_PER_USER,
  shareLinksPerUser: CONTENT_LIMITS.SHARE_LINKS_PER_USER,
  apiTokensPerUser: CONTENT_LIMITS.API_TOKENS_PER_USER,
  pushSubscriptionsPerUser: CONTENT_LIMITS.PUSH_SUBSCRIPTIONS_PER_USER,
  expoPushTokensPerUser: CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER,
  messagesPerConversation: CONTENT_LIMITS.MESSAGES_PER_CONVERSATION,
  noteContentMaxLength: FIELD_LENGTH_LIMITS.NOTE_CONTENT,
  tagNameMaxLength: FIELD_LENGTH_LIMITS.TAG_NAME,
};

/** Lets a client show "9 of 10" at a create button instead of only failing at the boundary (JEF-339). */
export class GetContentQuotaUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: GetContentQuotaInput): Promise<ContentQuota> {
    const { userId } = input;
    const [
      skills,
      workExperiences,
      educations,
      conversations,
      shareLinks,
      apiTokens,
      pushSubscriptions,
    ] = await Promise.all([
      this.deps.skillRepository.findAllByUserId(userId),
      this.deps.workExperienceRepository.findAllByUserId(userId),
      this.deps.educationRepository.findAllByUserId(userId),
      // Asking for the cap is enough: the list is full once it comes back that long.
      this.deps.conversationRepository.findAllByUserId(
        userId,
        CONTENT_LIMITS.CONVERSATIONS_PER_USER,
      ),
      this.deps.shareLinkRepository.findAllByUserId(userId),
      this.deps.apiTokenRepository.findAllByUserId(userId),
      this.deps.pushSubscriptionRepository.findByUserId(userId),
    ]);

    return {
      limits: CONTENT_QUOTA_LIMITS,
      usage: {
        conversations: conversations.length,
        workExperiences: workExperiences.length,
        educations: educations.length,
        skills: skills.length,
        shareLinks: shareLinks.length,
        apiTokens: apiTokens.length,
        pushSubscriptions: pushSubscriptions.filter((s) => s.provider === 'web').length,
        expoPushTokens: pushSubscriptions.filter((s) => s.provider === 'expo').length,
      },
    };
  }
}
