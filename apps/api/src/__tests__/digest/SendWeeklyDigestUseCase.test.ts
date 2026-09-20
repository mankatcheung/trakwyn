import { describe, it, expect, vi } from 'vitest';
import { SendWeeklyDigestUseCase } from '#src/use-cases/digest/SendWeeklyDigestUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { IEmailService, WeeklyDigestData } from '#src/use-cases/ports/IEmailService.js';

function makeEmailService(): IEmailService {
  return {
    sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
    sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
    sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
    sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('SendWeeklyDigestUseCase', () => {
  it('returns 0 sent when there are no users', async () => {
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([]) });
    const applicationRepository = makeApplicationRepository();
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 0, sent: 0, skipped: 0, failed: 0 });
    expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it('skips users with no applications', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 1, sent: 0, skipped: 1, failed: 0 });
    expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it('skips users who have disabled the weekly digest', async () => {
    const user = makeUser({ weeklyDigestEnabled: false });
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });
    const applicationRepository = makeApplicationRepository();
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 1, sent: 0, skipped: 1, failed: 0 });
    expect(applicationRepository.findAllByUserId).not.toHaveBeenCalled();
    expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it('skips users whose digest frequency is off', async () => {
    const user = makeUser({ digestFrequency: 'off', weeklyDigestEnabled: false });
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });
    const applicationRepository = makeApplicationRepository();
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 1, sent: 0, skipped: 1, failed: 0 });
    expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it('sends daily digests after the daily resend window', async () => {
    const user = makeUser({
      digestFrequency: 'daily',
      lastDigestSentAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([makeApplication()]),
    });
    const emailService = makeEmailService();

    await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith(
      user.email,
      expect.any(Object),
      'daily',
    );
  });

  it('sends a digest for each user with applications', async () => {
    const userA = makeUser({ id: 'u1', email: 'a@test.com' });
    const userB = makeUser({ id: 'u2', email: 'b@test.com' });
    const userRepository = makeUserRepository({
      findAll: vi.fn().mockResolvedValue([userA, userB]),
    });
    const app = makeApplication({ userId: 'u1' });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi
        .fn()
        .mockImplementation((uid: string) =>
          uid === 'u1' ? Promise.resolve([app]) : Promise.resolve([]),
        ),
    });
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 2, sent: 1, skipped: 1, failed: 0 });
    expect(emailService.sendWeeklyDigest).toHaveBeenCalledOnce();
    expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith('a@test.com', expect.any(Object));
    expect(userRepository.updateLastDigestSentAt).toHaveBeenCalledOnce();
    expect(userRepository.updateLastDigestSentAt).toHaveBeenCalledWith('u1', expect.any(Date));
  });

  it('skips a user whose lastDigestSentAt is within the resend window', async () => {
    const user = makeUser({ lastDigestSentAt: new Date(Date.now() - 1 * DAY_MS) });
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([makeApplication()]),
    });
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 1, sent: 0, skipped: 1, failed: 0 });
    expect(applicationRepository.findAllByUserId).not.toHaveBeenCalled();
    expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
    expect(userRepository.updateLastDigestSentAt).not.toHaveBeenCalled();
  });

  it('sends again once the resend window has elapsed', async () => {
    const user = makeUser({ lastDigestSentAt: new Date(Date.now() - 7 * DAY_MS) });
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([makeApplication()]),
    });
    const emailService = makeEmailService();

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 1, sent: 1, skipped: 0, failed: 0 });
    expect(emailService.sendWeeklyDigest).toHaveBeenCalledOnce();
    expect(userRepository.updateLastDigestSentAt).toHaveBeenCalledWith(user.id, expect.any(Date));
  });

  it("counts a user whose digest threw, rather than losing it in allSettled's shadow", async () => {
    const users = [makeUser({ id: 'user-1' }), makeUser({ id: 'user-2' })];
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue(users) });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([makeApplication()]),
    });
    const emailService = makeEmailService();
    emailService.sendWeeklyDigest = vi
      .fn()
      .mockRejectedValueOnce(new Error('Brevo timeout'))
      .mockResolvedValueOnce(undefined);

    const result = await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    expect(result).toEqual({ totalUsers: 2, sent: 1, skipped: 0, failed: 1 });
  });

  it('categorises new applications created in the last 7 days', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });

    const recentApp = makeApplication({
      company: 'New Co',
      role: 'Engineer',
      createdAt: new Date(Date.now() - 2 * DAY_MS),
    });
    const oldApp = makeApplication({
      company: 'Old Co',
      role: 'Dev',
      createdAt: new Date(Date.now() - 10 * DAY_MS),
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([recentApp, oldApp]),
    });
    const emailService = makeEmailService();

    await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    const [, digestData] = (emailService.sendWeeklyDigest as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, WeeklyDigestData];
    expect(digestData.newThisWeek).toHaveLength(1);
    expect(digestData.newThisWeek[0].company).toBe('New Co');
    expect(digestData.totalApplications).toBe(2);
  });

  it('identifies overdue follow-ups', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });

    const overdueApp = makeApplication({
      company: 'Stripe',
      role: 'SWE',
      followUpAt: new Date(Date.now() - 2 * DAY_MS),
      status: 'applied',
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([overdueApp]),
    });
    const emailService = makeEmailService();

    await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    const [, digestData] = (emailService.sendWeeklyDigest as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, WeeklyDigestData];
    expect(digestData.overdueFollowUps).toHaveLength(1);
    expect(digestData.overdueFollowUps[0].company).toBe('Stripe');
  });

  it('does not mark rejected/accepted/withdrawn apps as overdue', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });

    const rejectedApp = makeApplication({
      followUpAt: new Date(Date.now() - 2 * DAY_MS),
      status: 'rejected',
    });
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([rejectedApp]),
    });
    const emailService = makeEmailService();

    await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    const [, digestData] = (emailService.sendWeeklyDigest as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, WeeklyDigestData];
    expect(digestData.overdueFollowUps).toHaveLength(0);
  });

  it('includes correct status breakdown', async () => {
    const user = makeUser();
    const userRepository = makeUserRepository({ findAll: vi.fn().mockResolvedValue([user]) });

    const apps = [
      makeApplication({ status: 'applied' }),
      makeApplication({ status: 'applied' }),
      makeApplication({ status: 'interviewing' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });
    const emailService = makeEmailService();

    await new SendWeeklyDigestUseCase({
      userRepository,
      applicationRepository,
      emailService,
    }).execute();

    const [, digestData] = (emailService.sendWeeklyDigest as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, WeeklyDigestData];
    expect(digestData.byStatus).toEqual({ applied: 2, interviewing: 1 });
  });
});
