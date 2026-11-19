import { describe, it, expect, vi } from 'vitest';
import { CreateNotificationUseCase } from '#src/use-cases/notifications/CreateNotificationUseCase.js';
import {
  makeNotification,
  makeNotificationRepository,
} from '#src/__tests__/helpers/mocks/notifications.js';

describe('CreateNotificationUseCase', () => {
  it('generates an id and creates the notification', async () => {
    const created = makeNotification({ id: 'notification-1' });
    const notificationRepository = makeNotificationRepository({
      create: vi.fn().mockResolvedValue(created),
    });
    const generateId = vi.fn().mockReturnValue('notification-1');
    const useCase = new CreateNotificationUseCase({ notificationRepository, generateId });

    const result = await useCase.execute({
      userId: 'user-1',
      type: 'interview_reminder',
      title: 'Upcoming interview: Acme Corp',
      body: 'Software Engineer — phone interview tomorrow at 10:00 AM',
      url: '/applications/app-1',
    });

    expect(notificationRepository.create).toHaveBeenCalledWith({
      id: 'notification-1',
      userId: 'user-1',
      type: 'interview_reminder',
      title: 'Upcoming interview: Acme Corp',
      body: 'Software Engineer — phone interview tomorrow at 10:00 AM',
      url: '/applications/app-1',
    });
    expect(result).toEqual(created);
  });

  it('passes a null url through when omitted', async () => {
    const notificationRepository = makeNotificationRepository({
      create: vi.fn().mockResolvedValue(makeNotification()),
    });
    const useCase = new CreateNotificationUseCase({
      notificationRepository,
      generateId: vi.fn().mockReturnValue('notification-1'),
    });

    await useCase.execute({
      userId: 'user-1',
      type: 'security_alert',
      title: 'New sign-in detected',
      body: 'A new device just signed in to your account.',
    });

    expect(notificationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: undefined }),
    );
  });
});
