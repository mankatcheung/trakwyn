import { describe, it, expect, vi } from 'vitest';
import { ListCalendarConnectionsUseCase } from '#src/use-cases/calendar/ListCalendarConnectionsUseCase.js';
import {
  makeCalendarConnection,
  makeCalendarConnectionRepository,
} from '#src/__tests__/helpers/mocks/calendar.js';

describe('ListCalendarConnectionsUseCase', () => {
  it('returns every calendar connection for the user', async () => {
    const connections = [
      makeCalendarConnection({ id: 'c-1' }),
      makeCalendarConnection({ id: 'c-2' }),
    ];
    const useCase = new ListCalendarConnectionsUseCase({
      calendarConnectionRepository: makeCalendarConnectionRepository({
        findAllByUserId: vi.fn().mockResolvedValue(connections),
      }),
    });

    const result = await useCase.execute('user-1');

    expect(result).toEqual(connections);
  });
});
