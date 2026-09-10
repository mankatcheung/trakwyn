import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithRetry,
  createIdleAbortController,
} from '#src/infrastructure/llm/fetchWithRetry.js';
import { LLM } from '#src/use-cases/constants.js';

const okResponse = (status = 200) => ({ ok: status < 400, status }) as Response;

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the response on a successful first attempt', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(200));

    const response = await fetchWithRetry('https://example.com', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes an AbortSignal for the per-attempt timeout', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(200));

    await fetchWithRetry('https://example.com', { method: 'POST' });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('preserves the caller-supplied init options alongside the signal', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(200));

    await fetchWithRetry('https://example.com', {
      method: 'POST',
      headers: { 'x-api-key': 'secret' },
      body: '{"a":1}',
    });

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'x-api-key': 'secret' });
    expect(options.body).toBe('{"a":1}');
  });

  it('returns a 4xx response immediately without retrying', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(401));

    const response = await fetchWithRetry('https://example.com', {});

    expect(response.status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe('Retry-After (F7)', () => {
    const withRetryAfter = (status: number, value: string) =>
      ({ ok: false, status, headers: new Headers({ 'retry-after': value }) }) as Response;

    it('waits out a short Retry-After on a 429, then retries', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(withRetryAfter(429, '2'))
        .mockResolvedValueOnce(okResponse(200));

      const promise = fetchWithRetry('https://example.com', {});
      await vi.advanceTimersByTimeAsync(1_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('returns a 429 immediately when there is no Retry-After', async () => {
      vi.mocked(fetch).mockResolvedValue(okResponse(429));

      const response = await fetchWithRetry('https://example.com', {});

      expect(response.status).toBe(429);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('returns a 429 immediately when Retry-After is longer than the cap', async () => {
      vi.mocked(fetch).mockResolvedValue(
        withRetryAfter(429, String(LLM.RETRY_AFTER_MAX_MS / 1000 + 1)),
      );

      const response = await fetchWithRetry('https://example.com', {});

      expect(response.status).toBe(429);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('uses a 503 Retry-After instead of the backoff, and accepts an HTTP-date', async () => {
      const date = new Date(Date.now() + 1_000).toUTCString();
      vi.mocked(fetch)
        .mockResolvedValueOnce(withRetryAfter(503, date))
        .mockResolvedValueOnce(okResponse(200));

      const promise = fetchWithRetry('https://example.com', {});
      await vi.advanceTimersByTimeAsync(1_100);
      const response = await promise;

      expect(response.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('still gives up after the attempt budget even when every 429 names a delay', async () => {
      vi.mocked(fetch).mockResolvedValue(withRetryAfter(429, '1'));

      const promise = fetchWithRetry('https://example.com', {});
      await vi.runAllTimersAsync();
      const response = await promise;

      expect(response.status).toBe(429);
      expect(fetch).toHaveBeenCalledTimes(LLM.MAX_RETRIES + 1);
    });
  });

  it('retries a 5xx response up to the configured limit, then returns the final failure', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(503));

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(LLM.MAX_RETRIES + 1);
  });

  it('returns a successful response from a later retry after an initial 5xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(500)).mockResolvedValueOnce(okResponse(200));

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on a network error, then rethrows the last error once retries are exhausted', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    const promise = fetchWithRetry('https://example.com', {});
    // Attach the rejection assertion before advancing timers, so the
    // rejection is never briefly unhandled between the two awaits.
    const assertion = expect(promise).rejects.toThrow('fetch failed');
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetch).toHaveBeenCalledTimes(LLM.MAX_RETRIES + 1);
  });

  it('recovers from a network error on a later retry', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse(200));

    const promise = fetchWithRetry('https://example.com', {});
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws immediately without calling fetch when the external signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchWithRetry('https://example.com', {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('combines the external signal with the per-attempt timeout, so either can abort the fetch (JEF-240)', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();

    void fetchWithRetry('https://example.com', {}, controller.signal);
    await vi.advanceTimersByTimeAsync(0);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal!.aborted).toBe(false);

    controller.abort();
    expect(options.signal!.aborted).toBe(true);
  });

  it('stops retrying once the external signal aborts mid-loop, instead of exhausting all attempts', async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation(() => {
      // Simulate the client disconnecting partway through the first attempt.
      controller.abort();
      return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    });

    await expect(fetchWithRetry('https://example.com', {}, controller.signal)).rejects.toThrow();

    // One attempt, not LLM.MAX_RETRIES + 1 — retrying against a client that's
    // already gone would just waste more provider spend for nobody.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('waits with doubling backoff between retries', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(500));

    const promise = fetchWithRetry('https://example.com', {});

    // First retry: nothing happens until the base backoff elapses.
    await vi.advanceTimersByTimeAsync(LLM.RETRY_BACKOFF_BASE_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    // Second retry: backoff doubles.
    await vi.advanceTimersByTimeAsync(LLM.RETRY_BACKOFF_BASE_MS * 2 - 1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(3);

    await promise;
  });

  it('skips the internal per-attempt timeout when perAttemptTimeoutMs is null, relying only on externalSignal', async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(200));
    const controller = new AbortController();

    await fetchWithRetry('https://example.com', {}, controller.signal, null);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBe(controller.signal);
  });

  it('does not abort a perAttemptTimeoutMs: null call after what would have been the default timeout', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    void fetchWithRetry('https://example.com', {}, undefined, null);
    await vi.advanceTimersByTimeAsync(0);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeUndefined();

    await vi.advanceTimersByTimeAsync(LLM.REQUEST_TIMEOUT_MS);
    // No signal was ever created, so there is nothing to have fired.
    expect(options.signal).toBeUndefined();
  });
});

describe('createIdleAbortController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not abort while activity() keeps resetting the idle timer, even past the idle duration in total', async () => {
    const { signal, activity } = createIdleAbortController(1_000);

    // Ten "chunks" spaced just under the idle window apart — total elapsed
    // time (9_000ms) comfortably exceeds the 1_000ms idle window, but the
    // signal must never fire because each chunk resets the clock.
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(900);
      activity();
    }

    expect(signal.aborted).toBe(false);
  });

  it('aborts with a TimeoutError once idleMs passes with no activity() call', async () => {
    const { signal, activity } = createIdleAbortController(1_000);
    activity();

    await vi.advanceTimersByTimeAsync(999);
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe('TimeoutError');
  });

  it('aborts immediately, without arming a timer, when the external signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort('already gone');

    const { signal } = createIdleAbortController(1_000, controller.signal);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('already gone');
  });

  it('aborts when the external signal aborts mid-stream, before the idle window elapses', async () => {
    const controller = new AbortController();
    const { signal, activity } = createIdleAbortController(1_000, controller.signal);
    activity();

    await vi.advanceTimersByTimeAsync(500);
    controller.abort('client disconnected');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('client disconnected');
  });

  it('dispose() clears the pending timer so it never fires', async () => {
    const { signal, activity, dispose } = createIdleAbortController(1_000);
    activity();
    dispose();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(signal.aborted).toBe(false);
  });
});
