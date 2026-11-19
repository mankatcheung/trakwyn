import { describe, it, expect, vi } from 'vitest';
import { MarkNotificationsReadUseCase } from '#src/use-cases/notifications/MarkNotificationsReadUseCase.js';
import { makeNotificationRepository } from '#src/__tests__/helpers/mocks/notifications.js';

describe('MarkNotificationsReadUseCase', () => {
  it('marks the given notifications read for the user', async () => {
    const notificationRepository = makeNotificationRepository({
      markManyReadForUser: vi.fn().mockResolvedValue(2),
    });
    const useCase = new MarkNotificationsReadUseCase({ notificationRepository });

    await useCase.execute({ userId: 'user-1', ids: ['n-1', 'n-2'], isRead: true });

    expect(notificationRepository.markManyReadForUser).toHaveBeenCalledWith(
      'user-1',
      ['n-1', 'n-2'],
      true,
    );
  });

  it('marks the given notifications unread for the user', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new MarkNotificationsReadUseCase({ notificationRepository });

    await useCase.execute({ userId: 'user-1', ids: ['n-1'], isRead: false });

    expect(notificationRepository.markManyReadForUser).toHaveBeenCalledWith(
      'user-1',
      ['n-1'],
      false,
    );
  });

  it('throws VALIDATION when no ids are given', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new MarkNotificationsReadUseCase({ notificationRepository });

    const err = await useCase.execute({ userId: 'user-1', ids: [], isRead: true }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(notificationRepository.markManyReadForUser).not.toHaveBeenCalled();
  });

  it('throws VALIDATION when more than the max ids are given', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new MarkNotificationsReadUseCase({ notificationRepository });
    const ids = Array.from({ length: 201 }, (_, i) => `n-${i}`);

    const err = await useCase.execute({ userId: 'user-1', ids, isRead: true }).catch((e) => e);

    expect((err as { code: string }).code).toBe('VALIDATION');
    expect(notificationRepository.markManyReadForUser).not.toHaveBeenCalled();
  });
});
