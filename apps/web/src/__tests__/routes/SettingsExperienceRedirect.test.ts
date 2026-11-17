import { describe, it, expect, vi } from 'vitest';

const { redirectSpy } = vi.hoisted(() => ({
  redirectSpy: vi.fn((opts: unknown) => ({ redirect: opts })),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => opts,
  redirect: redirectSpy,
}));

import { Route } from '#/routes/_authenticated/settings/experience';

describe('settings/experience (moved to /profile)', () => {
  it('sends an old link to the profile page instead of a 404', () => {
    const beforeLoad = (Route as unknown as { beforeLoad: () => void }).beforeLoad;

    expect(() => beforeLoad()).toThrow();
    expect(redirectSpy).toHaveBeenCalledWith({ to: '/profile', replace: true });
  });
});
