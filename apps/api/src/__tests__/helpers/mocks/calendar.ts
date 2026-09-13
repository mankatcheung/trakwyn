/** Test doubles for the calendar-sync domain (JEF-331). */

import { vi } from 'vitest';
import type { ICalendarConnectionRepository } from '#src/use-cases/ports/ICalendarConnectionRepository.js';
import type { ICalendarSyncedEventRepository } from '#src/use-cases/ports/ICalendarSyncedEventRepository.js';
import type { ICalendarProvider } from '#src/use-cases/ports/ICalendarProvider.js';
import type { ICalendarProviderRegistry } from '#src/use-cases/ports/ICalendarProviderRegistry.js';
import type { ISyncCalendarEventUseCase } from '#src/use-cases/calendar/ISyncCalendarEventUseCase.js';
import type {
  CalendarConnection,
  CalendarSyncedEvent,
} from '#src/domain/calendarConnection/CalendarConnection.js';

export const makeCalendarConnectionRepository = (
  overrides?: Partial<ICalendarConnectionRepository>,
): ICalendarConnectionRepository => ({
  findAllByUserId: vi.fn().mockResolvedValue([]),
  findByUserIdAndProvider: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeCalendarConnection = (
  overrides?: Partial<CalendarConnection>,
): CalendarConnection => ({
  id: 'calendar-connection-1',
  userId: 'user-1',
  provider: 'google',
  accessToken: 'access-token-1',
  refreshToken: 'refresh-token-1',
  accessTokenExpiresAt: new Date('2099-01-01'),
  externalCalendarId: 'primary',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeCalendarSyncedEventRepository = (
  overrides?: Partial<ICalendarSyncedEventRepository>,
): ICalendarSyncedEventRepository => ({
  findBySource: vi.fn().mockResolvedValue(null),
  findAllByConnectionId: vi.fn().mockResolvedValue([]),
  upsert: vi.fn(),
  deleteBySource: vi.fn().mockResolvedValue(undefined),
  deleteAllByConnectionId: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeCalendarSyncedEvent = (
  overrides?: Partial<CalendarSyncedEvent>,
): CalendarSyncedEvent => ({
  id: 'synced-event-1',
  calendarConnectionId: 'calendar-connection-1',
  sourceType: 'interview',
  sourceId: 'round-1',
  externalEventId: 'external-event-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeCalendarProvider = (
  overrides?: Partial<ICalendarProvider>,
): ICalendarProvider => ({
  getAuthorizationUrl: vi.fn().mockReturnValue('https://provider.example.com/authorize'),
  exchangeCodeForTokens: vi.fn().mockResolvedValue({
    accessToken: 'access-token-1',
    refreshToken: 'refresh-token-1',
    accessTokenExpiresAt: new Date('2099-01-01'),
    externalCalendarId: 'primary',
  }),
  refreshAccessToken: vi.fn().mockResolvedValue({
    accessToken: 'refreshed-access-token',
    accessTokenExpiresAt: new Date('2099-01-01'),
  }),
  createEvent: vi.fn().mockResolvedValue({ externalEventId: 'external-event-1' }),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeCalendarProviderRegistry = (
  overrides?: Partial<ICalendarProviderRegistry>,
): ICalendarProviderRegistry => ({
  get: vi.fn().mockReturnValue(makeCalendarProvider()),
  ...overrides,
});

export const makeSyncCalendarEventUseCase = (
  overrides?: Partial<ISyncCalendarEventUseCase>,
): ISyncCalendarEventUseCase => ({
  execute: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});
