import { describe, it, expect, vi } from 'vitest';
import { CalendarResolver } from '#src/interface-adapters/resolvers/CalendarResolver.js';
import { CalendarConnectionMapper } from '#src/interface-adapters/mappers/CalendarConnectionMapper.js';
import type { IListCalendarConnectionsUseCase } from '#src/use-cases/calendar/IListCalendarConnectionsUseCase.js';
import type { IDisconnectCalendarUseCase } from '#src/use-cases/calendar/IDisconnectCalendarUseCase.js';
import { makeCalendarConnection } from '#src/__tests__/helpers/mocks/calendar.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeDeps = (overrides?: object) => ({
  listCalendarConnectionsUseCase: stub<IListCalendarConnectionsUseCase>({
    execute: vi.fn().mockResolvedValue([]),
  }),
  disconnectCalendarUseCase: stub<IDisconnectCalendarUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  calendarConnectionMapper: new CalendarConnectionMapper(),
  ...overrides,
});

describe('CalendarResolver', () => {
  describe('listConnections', () => {
    it('maps each connection to a DTO with no tokens', async () => {
      const connections = [makeCalendarConnection({ provider: 'google' })];
      const deps = makeDeps({
        listCalendarConnectionsUseCase: stub<IListCalendarConnectionsUseCase>({
          execute: vi.fn().mockResolvedValue(connections),
        }),
      });

      const result = await new CalendarResolver(deps).listConnections('user-1');

      expect(deps.listCalendarConnectionsUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([
        { provider: 'google', createdAt: connections[0].createdAt.toISOString() },
      ]);
    });
  });

  describe('disconnect', () => {
    it('delegates to disconnectCalendarUseCase and returns true', async () => {
      const deps = makeDeps();

      const result = await new CalendarResolver(deps).disconnect('user-1', 'microsoft');

      expect(deps.disconnectCalendarUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'microsoft',
      });
      expect(result).toBe(true);
    });
  });
});
