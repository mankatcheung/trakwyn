import { describe, it, expect, vi } from 'vitest';

const { redirectSpy } = vi.hoisted(() => ({
  redirectSpy: vi.fn((opts: unknown) => ({ redirect: opts })),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
  redirect: redirectSpy,
}));

import { Route } from '#/routes/_authenticated/applications/$applicationId/documents/new';

describe('documents/new (retired type-picker form)', () => {
  it('sends an old link to the resume form instead of a 404', () => {
    const beforeLoad = (
      Route as unknown as { beforeLoad: (a: { params: { applicationId: string } }) => void }
    ).beforeLoad;

    expect(() => beforeLoad({ params: { applicationId: 'app-1' } })).toThrow();
    expect(redirectSpy).toHaveBeenCalledWith({
      to: '/applications/$applicationId/resumes/new',
      params: { applicationId: 'app-1' },
      replace: true,
    });
  });
});
