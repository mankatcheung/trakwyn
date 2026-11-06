import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../settings/hooks/useLlmApiKeys', () => ({
  useLlmApiKeys: jest.fn(),
  llmApiKeysQueryKey: ['llmApiKeys'],
}));

import { useLlmApiKeys } from '../../../settings/hooks/useLlmApiKeys';
import { useAiCredits } from '../useAiCredits';

const costs = [
  { feature: 'resume', credits: 5 },
  { feature: 'polishDraft', credits: 2 },
];

function load(order: string[], aiCredits: Record<string, unknown>) {
  jest.mocked(useLlmApiKeys).mockReturnValue({
    data: {
      keys: [],
      aiProviderOrder: order,
      aiCredits: {
        used: 0,
        limit: 30,
        bonusRemaining: 0,
        resetsAt: '2026-12-01',
        costs,
        ...aiCredits,
      },
    },
  } as never);
}

function setup(client = new QueryClient()) {
  return renderHook(() => useAiCredits(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe('useAiCredits', () => {
  it('knows the cost and affords it while credits last', async () => {
    load(['trakwyn'], { used: 10 });
    const { result } = await setup();
    expect(result.current.onTrakwynAi).toBe(true);
    expect(result.current.costOf('resume')).toBe(5);
    expect(result.current.costOf('coverLetter')).toBeNull();
    expect(result.current.canAfford('resume')).toBe(true);
    expect(result.current.standing?.left).toBe(20);
  });

  it('reads the cost of the interview and briefing features from billing status', async () => {
    load(['trakwyn'], {
      costs: [
        { feature: 'mockQuestions', credits: 1 },
        { feature: 'mockAnswer', credits: 2 },
        { feature: 'talkingPoints', credits: 3 },
        { feature: 'companyBriefing', credits: 4 },
        { feature: 'resumeMatch', credits: 1 },
      ],
    });
    const { result } = await setup();
    expect(result.current.costOf('mockQuestions')).toBe(1);
    expect(result.current.costOf('mockAnswer')).toBe(2);
    expect(result.current.costOf('talkingPoints')).toBe(3);
    expect(result.current.costOf('companyBriefing')).toBe(4);
    expect(result.current.costOf('resumeMatch')).toBe(1);
  });

  it('exposes when the credits reset, only on Trakwyn AI plans', async () => {
    load(['trakwyn'], {});
    const hosted = await setup();
    expect(hosted.result.current.resetsAt).toBe('2026-12-01');
  });

  it('cannot afford an action when what is left is below its cost', async () => {
    load(['trakwyn'], { used: 29 });
    const { result } = await setup();
    expect(result.current.canAfford('polishDraft')).toBe(false);
  });

  it('cannot afford anything at zero, even with an unknown cost', async () => {
    load(['trakwyn'], { used: 30 });
    const { result } = await setup();
    expect(result.current.canAfford('coverLetter')).toBe(false);
  });

  it('shows no credit story for a user whose own key answers', async () => {
    load(['openai', 'trakwyn'], { used: 30 });
    const { result } = await setup();
    expect(result.current.onTrakwynAi).toBe(false);
    expect(result.current.canAfford('resume')).toBe(true);
  });

  it('falls through to the own key when the plan has no hosted AI', async () => {
    load(['trakwyn', 'openai'], { limit: 0 });
    const { result } = await setup();
    expect(result.current.onTrakwynAi).toBe(false);
    expect(result.current.needsSetup).toBe(false);
  });

  it('needs setup when nothing can answer', async () => {
    load(['trakwyn'], { limit: 0 });
    const { result } = await setup();
    expect(result.current.needsSetup).toBe(true);
  });

  it('refresh invalidates the shared llmApiKeys query', async () => {
    load(['trakwyn'], {});
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await setup(client);
    await act(async () => result.current.refresh());
    expect(spy).toHaveBeenCalledWith({ queryKey: ['llmApiKeys'] });
  });
});
