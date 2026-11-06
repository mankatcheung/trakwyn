import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRefreshAiCredits } from '../useRefreshAiCredits';

describe('useRefreshAiCredits', () => {
  it('invalidates the llmApiKeys query the credits meter reads', async () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useRefreshAiCredits(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => result.current());

    expect(spy).toHaveBeenCalledWith({ queryKey: ['llmApiKeys'] });
  });
});
