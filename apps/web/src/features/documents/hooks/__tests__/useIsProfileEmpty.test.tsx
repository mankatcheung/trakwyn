import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useIsProfileEmpty } from '#/features/documents/hooks/useIsProfileEmpty';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockGqlRequest } }));

function respond(workExperiences: unknown[], skills: unknown[]) {
  // Both queries go through the same client, and each reads only its own key.
  mockGqlRequest.mockResolvedValue({ workExperiences, skills });
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useIsProfileEmpty(), { wrapper });
}

describe('useIsProfileEmpty', () => {
  beforeEach(() => {
    mockGqlRequest.mockReset();
  }, 30_000);

  it('is false while the lists are loading', () => {
    mockGqlRequest.mockReturnValue(new Promise(() => {}));
    expect(setup().result.current).toBe(false);
  });

  it('is false when a list fails to load', async () => {
    mockGqlRequest.mockImplementation(() => Promise.reject(new Error('boom')));
    const { result } = setup();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
  });

  it('is true when there is no work experience and no skills', async () => {
    respond([], []);
    const { result } = setup();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is false when either list has an entry', async () => {
    respond([], [{ id: 's1' }]);
    const { result } = setup();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
  });
});
