import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCompleteOnboarding } from '#/features/onboarding/hooks/useCompleteOnboarding';
import {
  COMPLETE_ONBOARDING,
  ONBOARDING_STATE_KEY,
} from '#/features/onboarding/graphql/onboardingQueries';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request } }));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, invalidate, ...renderHook(() => useCompleteOnboarding(), { wrapper }) };
}

describe('useCompleteOnboarding', () => {
  beforeEach(() => {
    request.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('sends the goals', async () => {
    request.mockResolvedValue({});
    const { result } = setup();
    result.current.mutate(['track_applications'] as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(request).toHaveBeenCalledWith(COMPLETE_ONBOARDING, { goals: ['track_applications'] });
  });

  it('writes the guard cache entry so the next navigation is not sent back', async () => {
    request.mockResolvedValue({});
    const { result, client } = setup();
    result.current.mutate(['track_applications'] as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(ONBOARDING_STATE_KEY)).toEqual({
      onboardingCompletedAt: '2026-11-18T12:00:00.000Z',
      onboardingGoals: ['track_applications'],
    });
  });

  it('refreshes the dashboard checklist', async () => {
    request.mockResolvedValue({});
    const { result, invalidate } = setup();
    result.current.mutate([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['onboardingChecklist'] });
  });

  it('marks the flow done with no goals when skipped', async () => {
    request.mockResolvedValue({});
    const { result, client } = setup();
    result.current.mutate([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(request).toHaveBeenCalledWith(COMPLETE_ONBOARDING, { goals: [] });
    expect(client.getQueryData(ONBOARDING_STATE_KEY)).toMatchObject({ onboardingGoals: [] });
  });

  it('leaves the cache alone when the request fails', async () => {
    request.mockRejectedValue(new Error('down'));
    const { result, client, invalidate } = setup();
    result.current.mutate([]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(ONBOARDING_STATE_KEY)).toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
