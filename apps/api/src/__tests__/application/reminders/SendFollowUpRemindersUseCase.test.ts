import { describe, it, expect, vi } from 'vitest';
import { SendFollowUpRemindersUseCase } from '#src/use-cases/reminders/SendFollowUpRemindersUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';

const makeEmailService = (overrides?: Partial<IEmailService>): IEmailService => ({
  sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
  sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('SendFollowUpRemindersUseCase', () => {
  it('sends email and updates reminderSentAt for due applications', async () => {
    const followUpAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    const app = makeApplication({ followUpAt });
    const user = makeUser();
    const applicationRepository = makeApplicationRepository({
      findDueForReminder: vi.fn().mockResolvedValue([app]),
      updateReminderSentAt: vi.fn().mockResolvedValue(undefined),
    });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
    });
    const emailService = makeEmailService();

    const useCase = new SendFollowUpRemindersUseCase({
      applicationRepository,
      userRepository,
      emailService,
    });
    await useCase.execute();

    expect(emailService.sendFollowUpReminder).toHaveBeenCalledWith(
      user.email,
      app.company,
      app.role,
      followUpAt,
    );
    expect(applicationRepository.updateReminderSentAt).toHaveBeenCalledWith(
      app.id,
      expect.any(Date),
    );
  });

  it('skips applications when user is not found', async () => {
    const app = makeApplication({ followUpAt: new Date() });
    const applicationRepository = makeApplicationRepository({
      findDueForReminder: vi.fn().mockResolvedValue([app]),
      updateReminderSentAt: vi.fn(),
    });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(null),
    });
    const emailService = makeEmailService();

    await new SendFollowUpRemindersUseCase({
      applicationRepository,
      userRepository,
      emailService,
    }).execute();

    expect(emailService.sendFollowUpReminder).not.toHaveBeenCalled();
    expect(applicationRepository.updateReminderSentAt).not.toHaveBeenCalled();
  });

  it('skips applications for users who have disabled follow-up reminders', async () => {
    const app = makeApplication({ followUpAt: new Date() });
    const user = makeUser({ followUpRemindersEnabled: false });
    const applicationRepository = makeApplicationRepository({
      findDueForReminder: vi.fn().mockResolvedValue([app]),
      updateReminderSentAt: vi.fn(),
    });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
    });
    const emailService = makeEmailService();

    await new SendFollowUpRemindersUseCase({
      applicationRepository,
      userRepository,
      emailService,
    }).execute();

    expect(emailService.sendFollowUpReminder).not.toHaveBeenCalled();
    expect(applicationRepository.updateReminderSentAt).not.toHaveBeenCalled();
  });

  it('continues past individual email failures without throwing', async () => {
    const apps = [
      makeApplication({ id: 'app-1', followUpAt: new Date() }),
      makeApplication({ id: 'app-2', followUpAt: new Date() }),
    ];
    const user = makeUser();
    const applicationRepository = makeApplicationRepository({
      findDueForReminder: vi.fn().mockResolvedValue(apps),
      updateReminderSentAt: vi.fn().mockResolvedValue(undefined),
    });
    const userRepository = makeUserRepository({
      findById: vi.fn().mockResolvedValue(user),
    });
    const emailService = makeEmailService({
      sendFollowUpReminder: vi
        .fn()
        .mockRejectedValueOnce(new Error('Brevo timeout'))
        .mockResolvedValueOnce(undefined),
    });

    await expect(
      new SendFollowUpRemindersUseCase({
        applicationRepository,
        userRepository,
        emailService,
      }).execute(),
    ).resolves.not.toThrow();

    expect(emailService.sendFollowUpReminder).toHaveBeenCalledTimes(2);
    // Only the second app (which succeeded) should have reminderSentAt updated
    expect(applicationRepository.updateReminderSentAt).toHaveBeenCalledTimes(1);
    expect(applicationRepository.updateReminderSentAt).toHaveBeenCalledWith(
      'app-2',
      expect.any(Date),
    );
  });

  it('counts what it sent, failed on and skipped, so a partial run reads as partial', async () => {
    const apps = [
      makeApplication({ id: 'app-1', followUpAt: new Date() }),
      makeApplication({ id: 'app-2', followUpAt: new Date() }),
      makeApplication({ id: 'app-3', userId: 'user-off', followUpAt: new Date() }),
    ];
    const applicationRepository = makeApplicationRepository({
      findDueForReminder: vi.fn().mockResolvedValue(apps),
      updateReminderSentAt: vi.fn().mockResolvedValue(undefined),
    });
    const userRepository = makeUserRepository({
      findById: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(
            id === 'user-off' ? makeUser({ followUpRemindersEnabled: false }) : makeUser(),
          ),
        ),
    });
    const emailService = makeEmailService({
      sendFollowUpReminder: vi
        .fn()
        .mockRejectedValueOnce(new Error('Brevo timeout'))
        .mockResolvedValueOnce(undefined),
    });

    const summary = await new SendFollowUpRemindersUseCase({
      applicationRepository,
      userRepository,
      emailService,
    }).execute();

    expect(summary).toEqual({ sent: 1, failed: 1, skipped: 1 });
  });
});
