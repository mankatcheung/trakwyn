/**
 * Test doubles for the jobs domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { Application } from '#src/domain/application/Application.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';

export const makeApplicationRepository = (
  overrides?: Partial<IApplicationRepository>,
): IApplicationRepository => ({
  findAllByUserId: vi.fn(),
  findPageByUserId: vi.fn().mockResolvedValue({ items: [], hasNextPage: false }),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  reorderBoard: vi.fn().mockResolvedValue([]),
  findDueForReminder: vi.fn().mockResolvedValue([]),
  updateReminderSentAt: vi.fn().mockResolvedValue(undefined),
  findByIdIncludingTrashed: vi.fn(),
  findTrashedByUserId: vi.fn().mockResolvedValue([]),
  findDueForPurge: vi.fn().mockResolvedValue([]),
  softDelete: vi.fn().mockResolvedValue(undefined),
  restore: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

export const makeApplication = (overrides?: Partial<Application>): Application => ({
  id: 'app-1',
  userId: 'user-1',
  company: 'Acme Corp',
  role: 'Software Engineer',
  status: 'draft',
  jobUrl: null,
  location: null,
  salaryRange: null,
  description: null,
  postingText: null,
  appliedAt: null,
  starred: false,
  source: null,
  deletedAt: null,
  followUpAt: null,
  tags: [],
  reminderSentAt: null,
  boardPosition: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});
