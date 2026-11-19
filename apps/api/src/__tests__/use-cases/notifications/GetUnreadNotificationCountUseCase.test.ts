import { describe, it, expect, vi } from 'vitest';
import { GetUnreadNotificationCountUseCase } from '#src/use-cases/notifications/GetUnreadNotificationCountUseCase.js';
import { makeNotificationRepository } from '#src/__tests__/helpers/mocks/notifications.js';

describe('GetUnreadNotificationCountUseCase', () => {
  it("returns the repository's unread count for the user", async () => {
    const notificationRepository = makeNotificationRepository({
      countUnreadForUser: vi.fn().mockResolvedValue(3),
    });
    const useCase = new GetUnreadNotificationCountUseCase({ notificationRepository });

    const result = await useCase.execute('user-1');

    expect(notificationRepository.countUnreadForUser).toHaveBeenCalledWith('user-1');
    expect(result).toBe(3);
  });
});
