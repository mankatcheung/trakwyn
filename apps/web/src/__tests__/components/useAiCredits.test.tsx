import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({
  billing: null as unknown,
  settings: { data: undefined, isPending: true } as {
    data: { me: { aiProviderOrder: string[] } } | undefined;
    isPending: boolean;
  },
}));

vi.mock('#/lib/billingStatus', () => ({
  billingStatusQueryKey: ['billingStatus'],
  useBillingStatus: () => state.billing,
}));
vi.mock('#/routes/_authenticated/assistant/-runsOn', async () => {
  const actual = await vi.importActual<object>('#/routes/_authenticated/assistant/-runsOn');
  return { ...actual, useLlmSettings: () => state.settings };
});

import { useAiCredits } from '#/components/ai/hooks/useAiCredits';

const credits = (used: number, extra = {}) => ({
  aiCredits: {
    used,
    limit: 30,
    bonusRemaining: 0,
    resetsAt: '2026-12-01T00:00:00.000Z',
    costs: [
      { feature: 'coverLetter', credits: 3 },
      { feature: 'polishDraft', credits: 1 },
    ],
    ...extra,
  },
});
const settings = (order: string[]) => ({
  data: { me: { aiProviderOrder: order } },
  isPending: false,
});

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useAiCredits(), { wrapper }), invalidate };
}

describe('useAiCredits', () => {
  beforeEach(() => {
    state.billing = credits(0);
    state.settings = settings(['trakwyn']);
  });

  it('is on Trakwyn AI when it leads the provider order', () => {
    expect(setup().result.current.onTrakwynAi).toBe(true);
  });

  it('is not on Trakwyn AI when an own key leads, and nothing is ever unaffordable then', () => {
    state.billing = credits(30);
    state.settings = settings(['openai', 'trakwyn']);
    const { result } = setup();
    expect(result.current.onTrakwynAi).toBe(false);
    expect(result.current.canAfford('coverLetter')).toBe(true);
  });

  it('reports what a feature costs, and null when the API did not say', () => {
    const { result } = setup();
    expect(result.current.costOf('coverLetter')).toBe(3);
    expect(result.current.costOf('resume')).toBeNull();
  });

  it('cannot afford a feature that costs more than is left, but can afford a cheaper one', () => {
    state.billing = credits(28);
    const { result } = setup();
    expect(result.current.canAfford('coverLetter')).toBe(false);
    expect(result.current.canAfford('polishDraft')).toBe(true);
  });

  it('cannot afford anything at zero', () => {
    state.billing = credits(30);
    expect(setup().result.current.canAfford('polishDraft')).toBe(false);
  });

  it('needs setup once the order has loaded empty and the plan has no hosted AI', () => {
    state.billing = credits(0, { limit: 0 });
    state.settings = settings([]);
    expect(setup().result.current.needsSetup).toBe(true);
  });

  it('does not ask for setup while settings load', () => {
    state.settings = { data: undefined, isPending: true };
    expect(setup().result.current.needsSetup).toBe(false);
  });

  it('refresh re-reads the billing status', async () => {
    const { result, invalidate } = setup();
    await act(() => result.current.refresh());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billingStatus'] });
  });
});
