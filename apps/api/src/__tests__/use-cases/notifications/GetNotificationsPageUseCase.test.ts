import { describe, it, expect, vi } from 'vitest';
import { GetNotificationsPageUseCase } from '#src/use-cases/notifications/GetNotificationsPageUseCase.js';
import {
  makeNotification,
  makeNotificationRepository,
} from '#src/__tests__/helpers/mocks/notifications.js';

describe('GetNotificationsPageUseCase', () => {
  it('passes the userId and pagination through to the repository, defaulting the limit', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new GetNotificationsPageUseCase({ notificationRepository });

    await useCase.execute({ userId: 'user-1' });

    expect(notificationRepository.findPageByUserId).toHaveBeenCalledWith('user-1', {
      cursor: undefined,
      limit: 20,
    });
  });

  it('passes the given cursor and limit through unchanged when within bounds', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new GetNotificationsPageUseCase({ notificationRepository });

    await useCase.execute({ userId: 'user-1', cursor: 'notification-5', limit: 50 });

    expect(notificationRepository.findPageByUserId).toHaveBeenCalledWith('user-1', {
      cursor: 'notification-5',
      limit: 50,
    });
  });

  it('clamps a limit above the max down to the max', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new GetNotificationsPageUseCase({ notificationRepository });

    await useCase.execute({ userId: 'user-1', limit: 5000 });

    expect(notificationRepository.findPageByUserId).toHaveBeenCalledWith('user-1', {
      cursor: undefined,
      limit: 100,
    });
  });

  it('clamps a limit below 1 up to 1', async () => {
    const notificationRepository = makeNotificationRepository();
    const useCase = new GetNotificationsPageUseCase({ notificationRepository });

    await useCase.execute({ userId: 'user-1', limit: 0 });

    expect(notificationRepository.findPageByUserId).toHaveBeenCalledWith('user-1', {
      cursor: undefined,
      limit: 1,
    });
  });

  it('returns the last item id as nextCursor when there is a next page', async () => {
    const items = [makeNotification({ id: 'n-1' }), makeNotification({ id: 'n-2' })];
    const notificationRepository = makeNotificationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items, hasNextPage: true }),
    });
    const useCase = new GetNotificationsPageUseCase({ notificationRepository });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result).toEqual({ items, hasNextPage: true, nextCursor: 'n-2' });
  });

  it('returns a null nextCursor when there is no next page', async () => {
    const items = [makeNotification({ id: 'n-1' })];
    const notificationRepository = makeNotificationRepository({
      findPageByUserId: vi.fn().mockResolvedValue({ items, hasNextPage: false }),
    });
    const useCase = new GetNotificationsPageUseCase({ notificationRepository });

    const result = await useCase.execute({ userId: 'user-1' });

    expect(result.nextCursor).toBeNull();
  });
});
