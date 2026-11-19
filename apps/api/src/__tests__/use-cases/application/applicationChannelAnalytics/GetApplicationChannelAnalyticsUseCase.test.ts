import { describe, it, expect, vi } from 'vitest';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';
import { GetApplicationChannelAnalyticsUseCase } from '#src/use-cases/application/GetApplicationChannelAnalyticsUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetApplicationChannelAnalyticsUseCase', () => {
  it('returns empty groups when there are no applications', async () => {
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue([]),
    });

    const result = await new GetApplicationChannelAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result).toEqual({ bySource: [], byTag: [] });
  });

  it('groups applications by source case-insensitively, keeping the first-seen casing', async () => {
    const apps = [
      makeApplication({ id: 'app-1', source: 'LinkedIn', status: 'applied' }),
      makeApplication({ id: 'app-2', source: 'linkedin', status: 'interviewing' }),
      makeApplication({ id: 'app-3', source: 'Referral', status: 'draft' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetApplicationChannelAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.bySource).toEqual([
      {
        label: 'LinkedIn',
        applicationCount: 2,
        respondedCount: 1,
        responseRate: 50,
        offerCount: 0,
        offerRate: 0,
      },
      {
        label: 'Referral',
        applicationCount: 1,
        respondedCount: 0,
        responseRate: 0,
        offerCount: 0,
        offerRate: 0,
      },
    ]);
  });

  it('groups applications with no source under an explicit "(no source)" bucket', async () => {
    const apps = [
      makeApplication({ id: 'app-1', source: null }),
      makeApplication({ id: 'app-2', source: '  ' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetApplicationChannelAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.bySource).toEqual([
      expect.objectContaining({ label: '(no source)', applicationCount: 2 }),
    ]);
  });

  it('groups applications by tag, with an application appearing in every one of its tag groups', async () => {
    const apps = [
      makeApplication({ id: 'app-1', tags: ['remote', 'senior'], status: 'offered' }),
      makeApplication({ id: 'app-2', tags: ['remote'], status: 'rejected' }),
      makeApplication({ id: 'app-3', tags: [], status: 'applied' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetApplicationChannelAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.byTag).toEqual([
      {
        label: 'remote',
        applicationCount: 2,
        respondedCount: 2,
        responseRate: 100,
        offerCount: 1,
        offerRate: 50,
      },
      {
        label: 'senior',
        applicationCount: 1,
        respondedCount: 1,
        responseRate: 100,
        offerCount: 1,
        offerRate: 100,
      },
    ]);
  });

  it('computes offer rate from both offered and accepted statuses, and excludes drafts from the response-rate denominator', async () => {
    const apps = [
      makeApplication({ id: 'app-1', source: 'Indeed', status: 'draft' }),
      makeApplication({ id: 'app-2', source: 'Indeed', status: 'accepted' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetApplicationChannelAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.bySource).toEqual([
      {
        label: 'Indeed',
        applicationCount: 2,
        respondedCount: 1,
        responseRate: 100,
        offerCount: 1,
        offerRate: 50,
      },
    ]);
  });

  it('sorts groups by application count descending', async () => {
    const apps = [
      makeApplication({ id: 'app-1', source: 'Small', status: 'draft' }),
      makeApplication({ id: 'app-2', source: 'Big', status: 'draft' }),
      makeApplication({ id: 'app-3', source: 'Big', status: 'draft' }),
      makeApplication({ id: 'app-4', source: 'Big', status: 'draft' }),
    ];
    const applicationRepository = makeApplicationRepository({
      findAllByUserId: vi.fn().mockResolvedValue(apps),
    });

    const result = await new GetApplicationChannelAnalyticsUseCase({
      entitlementService: makeEntitlementService(),
      applicationRepository,
    }).execute({ userId: 'user-1' });

    expect(result.bySource.map((s) => s.label)).toEqual(['Big', 'Small']);
  });
});
