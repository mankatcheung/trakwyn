import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockRequest } }));

import { gqlContaining } from '#/__tests__/helpers/gqlText';
import { useBulkActions } from '../useBulkActions';

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useBulkActions(), { wrapper }), invalidate };
}

describe('useBulkActions', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({});
  });

  it('updates the status of every id and refreshes the applications', async () => {
    const { result, invalidate } = setup();
    await act(() => result.current.bulkUpdateStatus(['a', 'b'], 'APPLIED' as never));
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest).toHaveBeenCalledWith(gqlContaining('BulkUpdateApplication'), {
      id: 'a',
      input: { status: 'APPLIED' },
    });
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
      id: 'b',
      input: { status: 'APPLIED' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['applications'] });
  });

  it('stars or unstars every id', async () => {
    const { result } = setup();
    await act(() => result.current.bulkSetStarred(['a'], true));
    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), {
      id: 'a',
      input: { starred: true },
    });
  });

  it('adds a tag after the existing ones, without duplicating it', async () => {
    const { result } = setup();
    await act(() =>
      result.current.bulkAddTag(['a', 'b', 'c'], 'remote', [
        { id: 'a', tags: ['x'] },
        { id: 'b', tags: ['remote', 'y'] },
      ]),
    );
    const calls = mockRequest.mock.calls as Array<
      [unknown, { id: string; input: { tags: string[] } }]
    >;
    const inputs = Object.fromEntries(calls.map(([, v]) => [v.id, v.input.tags]));
    expect(inputs).toEqual({ a: ['x', 'remote'], b: ['remote', 'y'], c: ['remote'] });
  });

  it('is pending while the requests run and settled after', async () => {
    let release: () => void = () => {};
    mockRequest.mockReturnValue(new Promise<void>((r) => (release = r)));
    const { result } = setup();
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.bulkSetStarred(['a'], true);
    });
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      release();
      await done;
    });
    expect(result.current.isPending).toBe(false);
  });

  it('clears pending and still refreshes when a request fails', async () => {
    mockRequest.mockRejectedValue(new Error('boom'));
    const { result, invalidate } = setup();
    await act(async () => {
      await expect(result.current.bulkSetStarred(['a'], true)).rejects.toThrow('boom');
    });
    expect(result.current.isPending).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['applications'] });
  });
});
