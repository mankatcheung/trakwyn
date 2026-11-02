import { describe, it, expect, vi } from 'vitest';
import {
  CONTENT_QUOTA_LIMITS,
  GetContentQuotaUseCase,
} from '#src/use-cases/quotas/GetContentQuotaUseCase.js';
import { CONTENT_LIMITS, FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';
import {
  makeEducation,
  makeEducationRepository,
  makeSkill,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { makeConversation, makeConversationRepository } from '#src/__tests__/helpers/mocks/chat.js';
import { makeShareLink, makeShareLinkRepository } from '#src/__tests__/helpers/mocks/shareLinks.js';
import { makeApiToken, makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';
import {
  makePushSubscription,
  makePushSubscriptionRepository,
} from '#src/__tests__/helpers/mocks/push.js';

const many = <T>(make: () => T, count: number): T[] => Array.from({ length: count }, make);

function build() {
  const deps = {
    skillRepository: makeSkillRepository({
      findAllByUserId: vi.fn().mockResolvedValue(many(() => makeSkill(), 4)),
    }),
    workExperienceRepository: makeWorkExperienceRepository({
      findAllByUserId: vi.fn().mockResolvedValue(many(() => makeWorkExperience(), 2)),
    }),
    educationRepository: makeEducationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(many(() => makeEducation(), 1)),
    }),
    conversationRepository: makeConversationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(many(() => makeConversation(), 7)),
    }),
    shareLinkRepository: makeShareLinkRepository({
      findAllByUserId: vi.fn().mockResolvedValue(many(() => makeShareLink(), 3)),
    }),
    apiTokenRepository: makeApiTokenRepository({
      findAllByUserId: vi.fn().mockResolvedValue(many(() => makeApiToken(), 5)),
    }),
    pushSubscriptionRepository: makePushSubscriptionRepository({
      findByUserId: vi
        .fn()
        .mockResolvedValue([
          makePushSubscription({ provider: 'web' }),
          makePushSubscription({ provider: 'web' }),
          makePushSubscription({ provider: 'expo' }),
        ]),
    }),
  };
  return { deps, useCase: new GetContentQuotaUseCase(deps) };
}

describe('GetContentQuotaUseCase', () => {
  it('reports how much of each per-user limit the caller has used', async () => {
    const { useCase } = build();

    const { usage } = await useCase.execute({ userId: 'user-1' });

    expect(usage).toEqual({
      conversations: 7,
      workExperiences: 2,
      educations: 1,
      skills: 4,
      shareLinks: 3,
      apiTokens: 5,
      pushSubscriptions: 2,
      expoPushTokens: 1,
    });
  });

  it('asks only for the caller’s own rows', async () => {
    const { useCase, deps } = build();

    await useCase.execute({ userId: 'user-9' });

    expect(deps.skillRepository.findAllByUserId).toHaveBeenCalledWith('user-9');
    expect(deps.pushSubscriptionRepository.findByUserId).toHaveBeenCalledWith('user-9');
    expect(deps.conversationRepository.findAllByUserId).toHaveBeenCalledWith(
      'user-9',
      CONTENT_LIMITS.CONVERSATIONS_PER_USER,
    );
  });

  it('returns the same limits for everyone', async () => {
    const { useCase } = build();

    const { limits } = await useCase.execute({ userId: 'user-1' });

    expect(limits).toBe(CONTENT_QUOTA_LIMITS);
  });

  it('exposes every cap and length limit added by JEF-339, so a client never has to copy a number', () => {
    const exposed = Object.values(CONTENT_QUOTA_LIMITS);
    const added = [
      CONTENT_LIMITS.NOTES_PER_APPLICATION,
      CONTENT_LIMITS.CONTACTS_PER_APPLICATION,
      CONTENT_LIMITS.INTERVIEW_ROUNDS_PER_APPLICATION,
      CONTENT_LIMITS.OFFERS_PER_APPLICATION,
      CONTENT_LIMITS.TAGS_PER_APPLICATION,
      CONTENT_LIMITS.DOCUMENT_DRAFTS_PER_APPLICATION,
      CONTENT_LIMITS.CONVERSATIONS_PER_USER,
      CONTENT_LIMITS.WORK_EXPERIENCES_PER_USER,
      CONTENT_LIMITS.EDUCATIONS_PER_USER,
      CONTENT_LIMITS.SKILLS_PER_USER,
      CONTENT_LIMITS.SHARE_LINKS_PER_USER,
      CONTENT_LIMITS.API_TOKENS_PER_USER,
      CONTENT_LIMITS.PUSH_SUBSCRIPTIONS_PER_USER,
      CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER,
      CONTENT_LIMITS.MESSAGES_PER_CONVERSATION,
      FIELD_LENGTH_LIMITS.NOTE_CONTENT,
      FIELD_LENGTH_LIMITS.TAG_NAME,
    ];
    expect(Object.keys(CONTENT_QUOTA_LIMITS)).toHaveLength(added.length);
    for (const value of added) expect(exposed).toContain(value);
  });
});
