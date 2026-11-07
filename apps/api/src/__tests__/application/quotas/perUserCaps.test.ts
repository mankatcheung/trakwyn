import { describe, it, expect, vi } from 'vitest';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { CreateSkillUseCase } from '#src/use-cases/skill/CreateSkillUseCase.js';
import { CreateWorkExperienceUseCase } from '#src/use-cases/workExperience/CreateWorkExperienceUseCase.js';
import { CreateEducationUseCase } from '#src/use-cases/education/CreateEducationUseCase.js';
import { CreateConversationUseCase } from '#src/use-cases/conversations/CreateConversationUseCase.js';
import { CreateShareLinkUseCase } from '#src/use-cases/shareLinks/CreateShareLinkUseCase.js';
import { CreateApiTokenUseCase } from '#src/use-cases/apiTokens/CreateApiTokenUseCase.js';
import { RegisterPushSubscriptionUseCase } from '#src/use-cases/push/RegisterPushSubscriptionUseCase.js';
import { RegisterExpoPushTokenUseCase } from '#src/use-cases/push/RegisterExpoPushTokenUseCase.js';
import { ImportCvProfileUseCase } from '#src/use-cases/profile/ImportCvProfileUseCase.js';
import {
  makeEducation,
  makeEducationRepository,
  makeSkill,
  makeSkillRepository,
  makeWorkExperience,
  makeWorkExperienceRepository,
} from '#src/__tests__/helpers/mocks/profile.js';
import { makeConversation, makeConversationRepository } from '#src/__tests__/helpers/mocks/chat.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeLlmApiKeyRepository } from '#src/__tests__/helpers/mocks/llm.js';
import { makeShareLink, makeShareLinkRepository } from '#src/__tests__/helpers/mocks/shareLinks.js';
import { makeApiToken, makeApiTokenRepository } from '#src/__tests__/helpers/mocks/apiTokens.js';
import {
  makePushSubscription,
  makePushSubscriptionRepository,
} from '#src/__tests__/helpers/mocks/push.js';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';

const rows = <T>(make: (i: number) => T, count: number): T[] =>
  Array.from({ length: count }, (_, i) => make(i));

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> =>
  ((await promise.catch((e) => e)) as { code?: string }).code;

const messageOf = async (promise: Promise<unknown>): Promise<string> =>
  ((await promise.catch((e) => e)) as Error).message;

describe('per-user caps (JEF-339)', () => {
  describe('skills', () => {
    const build = (count: number) => {
      const skillRepository = makeSkillRepository({
        findAllByUserId: vi.fn().mockResolvedValue(rows((i) => makeSkill({ id: `s${i}` }), count)),
        create: vi.fn().mockResolvedValue(makeSkill()),
      });
      return {
        skillRepository,
        useCase: new CreateSkillUseCase({ skillRepository, generateId: () => 'skill-new' }),
      };
    };
    const input = { userId: 'user-1', name: 'Go' };

    it('creates a skill one below the cap', async () => {
      const { useCase, skillRepository } = build(CONTENT_LIMITS.SKILLS_PER_USER - 1);
      await useCase.execute(input);
      expect(skillRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap, naming the limit', async () => {
      const { useCase, skillRepository } = build(CONTENT_LIMITS.SKILLS_PER_USER);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(await messageOf(useCase.execute(input))).toContain(
        String(CONTENT_LIMITS.SKILLS_PER_USER),
      );
      expect(skillRepository.create).not.toHaveBeenCalled();
    });

    it('only counts the caller’s own skills', async () => {
      const { useCase, skillRepository } = build(0);
      await useCase.execute(input);
      expect(skillRepository.findAllByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('work experience', () => {
    const build = (count: number) => {
      const workExperienceRepository = makeWorkExperienceRepository({
        findAllByUserId: vi
          .fn()
          .mockResolvedValue(rows((i) => makeWorkExperience({ id: `w${i}` }), count)),
        create: vi.fn().mockResolvedValue(makeWorkExperience()),
      });
      return {
        workExperienceRepository,
        useCase: new CreateWorkExperienceUseCase({
          workExperienceRepository,
          generateId: () => 'we-new',
        }),
      };
    };
    const input = {
      userId: 'user-1',
      company: 'Acme',
      title: 'Engineer',
      startDate: new Date('2020-01-01'),
    } as Parameters<CreateWorkExperienceUseCase['execute']>[0];

    it('creates one below the cap', async () => {
      const { useCase, workExperienceRepository } = build(
        CONTENT_LIMITS.WORK_EXPERIENCES_PER_USER - 1,
      );
      await useCase.execute(input);
      expect(workExperienceRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, workExperienceRepository } = build(CONTENT_LIMITS.WORK_EXPERIENCES_PER_USER);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(workExperienceRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('education', () => {
    const build = (count: number) => {
      const educationRepository = makeEducationRepository({
        findAllByUserId: vi
          .fn()
          .mockResolvedValue(rows((i) => makeEducation({ id: `e${i}` }), count)),
        create: vi.fn().mockResolvedValue(makeEducation()),
      });
      return {
        educationRepository,
        useCase: new CreateEducationUseCase({ educationRepository, generateId: () => 'edu-new' }),
      };
    };
    const input = {
      userId: 'user-1',
      institution: 'State',
      startDate: new Date('2012-01-01'),
    } as Parameters<CreateEducationUseCase['execute']>[0];

    it('creates one below the cap', async () => {
      const { useCase, educationRepository } = build(CONTENT_LIMITS.EDUCATIONS_PER_USER - 1);
      await useCase.execute(input);
      expect(educationRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, educationRepository } = build(CONTENT_LIMITS.EDUCATIONS_PER_USER);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(educationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('conversations', () => {
    const build = (count: number) => {
      const conversationRepository = makeConversationRepository({
        findAllByUserId: vi
          .fn()
          .mockResolvedValue(rows((i) => makeConversation({ id: `c${i}` }), count)),
        create: vi.fn().mockResolvedValue(makeConversation()),
      });
      return {
        conversationRepository,
        useCase: new CreateConversationUseCase({
          conversationRepository,
          llmApiKeyRepository: makeLlmApiKeyRepository(),
          generateId: () => 'conv-new',
        }),
      };
    };

    it('creates one below the cap', async () => {
      const { useCase, conversationRepository } = build(CONTENT_LIMITS.CONVERSATIONS_PER_USER - 1);
      await useCase.execute({ userId: 'user-1' });
      expect(conversationRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap, and only asks for as many rows as the cap', async () => {
      const { useCase, conversationRepository } = build(CONTENT_LIMITS.CONVERSATIONS_PER_USER);
      expect(await codeOf(useCase.execute({ userId: 'user-1' }))).toBe('QUOTA_EXCEEDED');
      expect(conversationRepository.create).not.toHaveBeenCalled();
      expect(conversationRepository.findAllByUserId).toHaveBeenCalledWith(
        'user-1',
        CONTENT_LIMITS.CONVERSATIONS_PER_USER,
      );
    });
  });

  describe('share links', () => {
    const build = (count: number) => {
      const shareLinkRepository = makeShareLinkRepository({
        findAllByUserId: vi
          .fn()
          .mockResolvedValue(rows((i) => makeShareLink({ id: `l${i}` }), count)),
        create: vi.fn().mockResolvedValue(makeShareLink()),
      });
      return {
        shareLinkRepository,
        useCase: new CreateShareLinkUseCase({
          entitlementService: makeEntitlementService(),
          shareLinkRepository,
          generateId: () => 'link-new',
        }),
      };
    };
    const input = { userId: 'user-1', name: 'Recruiter' };

    it('creates one below the cap', async () => {
      const { useCase, shareLinkRepository } = build(CONTENT_LIMITS.SHARE_LINKS_PER_USER - 1);
      await useCase.execute(input);
      expect(shareLinkRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, shareLinkRepository } = build(CONTENT_LIMITS.SHARE_LINKS_PER_USER);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(shareLinkRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('API tokens', () => {
    const build = (count: number) => {
      const apiTokenRepository = makeApiTokenRepository({
        findAllByUserId: vi
          .fn()
          .mockResolvedValue(rows((i) => makeApiToken({ id: `t${i}` }), count)),
        create: vi.fn().mockResolvedValue(makeApiToken()),
      });
      return {
        apiTokenRepository,
        useCase: new CreateApiTokenUseCase({ apiTokenRepository, generateId: () => 'tok-new' }),
      };
    };
    const input = { userId: 'user-1', name: 'CLI' };

    it('creates one below the cap', async () => {
      const { useCase, apiTokenRepository } = build(CONTENT_LIMITS.API_TOKENS_PER_USER - 1);
      await useCase.execute(input);
      expect(apiTokenRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, apiTokenRepository } = build(CONTENT_LIMITS.API_TOKENS_PER_USER);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(apiTokenRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('push registrations', () => {
    const webSubs = (count: number) =>
      rows(
        (i) =>
          makePushSubscription({ id: `w${i}`, endpoint: `https://push/${i}`, provider: 'web' }),
        count,
      );
    const expoSubs = (count: number) =>
      rows(
        (i) =>
          makePushSubscription({
            id: `x${i}`,
            endpoint: `ExponentPushToken[${i}]`,
            provider: 'expo',
          }),
        count,
      );

    const webUseCase = (existing: ReturnType<typeof makePushSubscription>[]) => {
      const pushSubscriptionRepository = makePushSubscriptionRepository({
        findByUserId: vi.fn().mockResolvedValue(existing),
        upsert: vi.fn().mockResolvedValue(makePushSubscription()),
      });
      return {
        pushSubscriptionRepository,
        useCase: new RegisterPushSubscriptionUseCase({
          pushSubscriptionRepository,
          generateId: () => 'sub-new',
        }),
      };
    };
    const expoUseCase = (existing: ReturnType<typeof makePushSubscription>[]) => {
      const pushSubscriptionRepository = makePushSubscriptionRepository({
        findByUserId: vi.fn().mockResolvedValue(existing),
        upsert: vi.fn().mockResolvedValue(makePushSubscription()),
      });
      return {
        pushSubscriptionRepository,
        useCase: new RegisterExpoPushTokenUseCase({
          pushSubscriptionRepository,
          generateId: () => 'sub-new',
        }),
      };
    };
    const webInput = { userId: 'user-1', endpoint: 'https://push/new', p256dh: 'k', auth: 'a' };

    it('registers a new browser one below the cap', async () => {
      const { useCase, pushSubscriptionRepository } = webUseCase(
        webSubs(CONTENT_LIMITS.PUSH_SUBSCRIPTIONS_PER_USER - 1),
      );
      await useCase.execute(webInput);
      expect(pushSubscriptionRepository.upsert).toHaveBeenCalled();
    });

    it('refuses a new browser at the cap', async () => {
      const { useCase, pushSubscriptionRepository } = webUseCase(
        webSubs(CONTENT_LIMITS.PUSH_SUBSCRIPTIONS_PER_USER),
      );
      expect(await codeOf(useCase.execute(webInput))).toBe('QUOTA_EXCEEDED');
      expect(pushSubscriptionRepository.upsert).not.toHaveBeenCalled();
    });

    it('lets a browser that is already registered re-register at the cap', async () => {
      const existing = webSubs(CONTENT_LIMITS.PUSH_SUBSCRIPTIONS_PER_USER);
      const { useCase, pushSubscriptionRepository } = webUseCase(existing);
      await useCase.execute({ ...webInput, endpoint: existing[0].endpoint });
      expect(pushSubscriptionRepository.upsert).toHaveBeenCalled();
    });

    it('counts browsers and phones separately', async () => {
      const { useCase, pushSubscriptionRepository } = webUseCase(
        expoSubs(CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER),
      );
      await useCase.execute(webInput);
      expect(pushSubscriptionRepository.upsert).toHaveBeenCalled();
    });

    it('registers a new phone one below the cap', async () => {
      const { useCase, pushSubscriptionRepository } = expoUseCase(
        expoSubs(CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER - 1),
      );
      await useCase.execute({ userId: 'user-1', token: 'ExponentPushToken[new]' });
      expect(pushSubscriptionRepository.upsert).toHaveBeenCalled();
    });

    it('refuses a new phone at the cap', async () => {
      const { useCase, pushSubscriptionRepository } = expoUseCase(
        expoSubs(CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER),
      );
      expect(
        await codeOf(useCase.execute({ userId: 'user-1', token: 'ExponentPushToken[new]' })),
      ).toBe('QUOTA_EXCEEDED');
      expect(pushSubscriptionRepository.upsert).not.toHaveBeenCalled();
    });

    it('lets a phone that is already registered re-register at the cap', async () => {
      const existing = expoSubs(CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER);
      const { useCase, pushSubscriptionRepository } = expoUseCase(existing);
      await useCase.execute({ userId: 'user-1', token: existing[0].endpoint });
      expect(pushSubscriptionRepository.upsert).toHaveBeenCalled();
    });
  });

  describe('CV import', () => {
    const build = (have: { work: number; edu: number; skills: number }) => {
      const deps = {
        workExperienceRepository: makeWorkExperienceRepository({
          findAllByUserId: vi.fn().mockResolvedValue(rows(() => makeWorkExperience(), have.work)),
          create: vi.fn().mockImplementation(async (d) => d),
        }),
        educationRepository: makeEducationRepository({
          findAllByUserId: vi.fn().mockResolvedValue(rows(() => makeEducation(), have.edu)),
          create: vi.fn().mockImplementation(async (d) => d),
        }),
        skillRepository: makeSkillRepository({
          findAllByUserId: vi.fn().mockResolvedValue(rows(() => makeSkill(), have.skills)),
          create: vi.fn().mockImplementation(async (d) => d),
        }),
        userRepository: makeUserRepository({ findById: vi.fn().mockResolvedValue(makeUser()) }),
        generateId: () => 'id',
      };
      return { deps, useCase: new ImportCvProfileUseCase(deps) };
    };
    const skills = (count: number) =>
      rows((i) => ({ name: `Skill ${i}`, category: 'Language' }), count);

    it('imports when everything fits exactly', async () => {
      const { useCase, deps } = build({
        work: 0,
        edu: 0,
        skills: CONTENT_LIMITS.SKILLS_PER_USER - 2,
      });
      await useCase.execute({
        userId: 'user-1',
        workExperiences: [],
        educations: [],
        skills: skills(2),
      });
      expect(deps.skillRepository.create).toHaveBeenCalledTimes(2);
    });

    it('refuses the whole CV, writing nothing, when the skills would pass the cap', async () => {
      const { useCase, deps } = build({
        work: 0,
        edu: 0,
        skills: CONTENT_LIMITS.SKILLS_PER_USER - 1,
      });
      const promise = useCase.execute({
        userId: 'user-1',
        workExperiences: [
          {
            company: 'Acme',
            title: 'Engineer',
            location: null,
            startDate: new Date('2020-01-01T00:00:00Z'),
            endDate: null,
            description: null,
          },
        ],
        educations: [],
        skills: skills(2),
      });
      expect(await codeOf(promise)).toBe('QUOTA_EXCEEDED');
      expect(deps.workExperienceRepository.create).not.toHaveBeenCalled();
      expect(deps.skillRepository.create).not.toHaveBeenCalled();
    });

    it('says how many still fit', async () => {
      const { useCase } = build({ work: 0, edu: 0, skills: CONTENT_LIMITS.SKILLS_PER_USER - 1 });
      const message = await messageOf(
        useCase.execute({
          userId: 'user-1',
          workExperiences: [],
          educations: [],
          skills: skills(2),
        }),
      );
      expect(message).toContain('room for 1 more');
    });
  });
});
