import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { useDraftSaver } from '../useDraftSaver';

const mockedGql = jest.mocked(gqlRequest);
const payload = (plainText: string) => ({ contentJson: '{}', plainText });

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useDraftSaver', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves the draft and records when', async () => {
    mockedGql.mockResolvedValueOnce({
      updateDocumentDraftContent: { id: 'd1', updatedAt: '2026-05-01T00:00:00.000Z' },
    });
    const { result } = await renderHook(() => useDraftSaver('d1'), { wrapper });

    let ok = false;
    await act(async () => {
      ok = await result.current.save({ ...payload('hello'), aiInstructions: 'short' });
    });

    expect(ok).toBe(true);
    expect(mockedGql).toHaveBeenCalledWith(expect.any(String), {
      input: { draftId: 'd1', contentJson: '{}', plainText: 'hello', aiInstructions: 'short' },
    });
    expect(result.current.lastSavedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(result.current.error).toBeNull();
  });

  it('runs saves one after another', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    mockedGql.mockImplementation(((_q: string, vars: { input: { plainText: string } }) => {
      order.push(`start:${vars.input.plainText}`);
      const done = () => ({ updateDocumentDraftContent: { id: 'd1', updatedAt: 'x' } });
      if (vars.input.plainText === 'first') {
        return new Promise((r) => (releaseFirst = () => r(done())));
      }
      return Promise.resolve(done());
    }) as never);
    const { result } = await renderHook(() => useDraftSaver('d1'), { wrapper });

    let both: Promise<unknown> = Promise.resolve();
    await act(async () => {
      both = Promise.all([
        result.current.save(payload('first')),
        result.current.save(payload('second')),
      ]);
    });
    expect(order).toEqual(['start:first']);
    await act(async () => {
      releaseFirst();
      await both;
    });
    expect(order).toEqual(['start:first', 'start:second']);
  });

  it('keeps a failed payload for retry', async () => {
    mockedGql
      .mockRejectedValueOnce({ response: { errors: [{ message: 'Down' }] } })
      .mockResolvedValueOnce({ updateDocumentDraftContent: { id: 'd1', updatedAt: 'later' } });
    const { result } = await renderHook(() => useDraftSaver('d1'), { wrapper });

    await act(async () => {
      expect(await result.current.save(payload('lost?'))).toBe(false);
    });
    expect(result.current.error).toBe('Down');

    await act(async () => {
      expect(await result.current.retry()).toBe(true);
    });
    expect(mockedGql).toHaveBeenLastCalledWith(expect.any(String), {
      input: expect.objectContaining({ plainText: 'lost?' }),
    });
    expect(result.current.error).toBeNull();
  });

  it('does nothing without a draft', async () => {
    const { result } = await renderHook(() => useDraftSaver(undefined), { wrapper });
    await act(async () => {
      expect(await result.current.save(payload('x'))).toBe(false);
    });
    expect(mockedGql).not.toHaveBeenCalled();
  });
});
