import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));
vi.mock('#/graphql/client', () => ({ gqlClient: { request: mockRequest } }));

import { gqlContaining } from '#/__tests__/helpers/gqlText';
import { usePushNotifications } from '../usePushNotifications';

type Json = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

function makeSub(
  json: Json = { endpoint: 'https://push.test/1', keys: { p256dh: 'p', auth: 'a' } },
) {
  return { toJSON: () => json, unsubscribe: vi.fn().mockResolvedValue(true) };
}

const original = {
  serviceWorker: Object.getOwnPropertyDescriptor(navigator, 'serviceWorker'),
  PushManager: Object.getOwnPropertyDescriptor(window, 'PushManager'),
  Notification: Object.getOwnPropertyDescriptor(window, 'Notification'),
};

function install(opts: {
  supported?: boolean;
  permission?: NotificationPermission;
  requested?: NotificationPermission;
  existing?: ReturnType<typeof makeSub> | null;
  subscribe?: () => Promise<unknown>;
}) {
  const subscribe = vi.fn(opts.subscribe ?? (() => Promise.resolve(makeSub())));
  const getSubscription = vi.fn().mockResolvedValue(opts.existing ?? null);
  if (opts.supported === false) {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'PushManager');
  } else {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  }
  const requestPermission = vi.fn().mockResolvedValue(opts.requested ?? 'granted');
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: opts.permission ?? 'default', requestPermission },
  });
  return { subscribe, requestPermission };
}

function mockVapid(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

describe('usePushNotifications', () => {
  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [key, target] of [
      ['serviceWorker', navigator],
      ['PushManager', window],
      ['Notification', window],
    ] as const) {
      const d = original[key];
      if (d) Object.defineProperty(target, key, d);
      else Reflect.deleteProperty(target, key);
    }
  });

  it('reports an unsupported browser and refuses to enable', async () => {
    install({ supported: false });
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);
    let ok = true;
    await act(async () => {
      ok = await result.current.enable();
    });
    expect(ok).toBe(false);
  });

  it('reads the granted and denied permission', () => {
    install({ permission: 'granted' });
    expect(renderHook(() => usePushNotifications()).result.current).toMatchObject({
      isPermissionGranted: true,
      isPermissionDenied: false,
    });
    install({ permission: 'denied' });
    expect(renderHook(() => usePushNotifications()).result.current).toMatchObject({
      isPermissionGranted: false,
      isPermissionDenied: true,
    });
  });

  it('picks up an existing subscription on mount', async () => {
    const existing = makeSub();
    install({ permission: 'granted', existing });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscription).toBe(existing));
  });

  it('ignores a failure to read the existing subscription', async () => {
    install({});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('no sw')) },
    });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {});
    expect(result.current.subscription).toBeNull();
  });

  it('stops when the user denies permission', async () => {
    install({ requested: 'denied' });
    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => {
      ok = await result.current.enable();
    });
    expect(ok).toBe(false);
    expect(result.current).toMatchObject({ isPermissionDenied: true, isBusy: false });
  });

  it('stops without being denied when the prompt is dismissed', async () => {
    install({ requested: 'default' });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.isPermissionDenied).toBe(false);
  });

  it.each([
    ['the key request fails', { publicKey: 'x' }, false],
    ['the key is empty', { publicKey: '' }, true],
  ])('stops when %s', async (_name, body, ok) => {
    const { subscribe } = install({});
    mockVapid(body, ok);
    const { result } = renderHook(() => usePushNotifications());
    let done = true;
    await act(async () => {
      done = await result.current.enable();
    });
    expect(done).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.isBusy).toBe(false);
  });

  it('subscribes, registers with the API and keeps the subscription', async () => {
    const sub = makeSub();
    const { subscribe } = install({ subscribe: () => Promise.resolve(sub) });
    mockVapid({ publicKey: 'AQAB-_w' });
    const { result } = renderHook(() => usePushNotifications());
    let ok = false;
    await act(async () => {
      ok = await result.current.enable();
    });
    expect(ok).toBe(true);
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    });
    expect(mockRequest).toHaveBeenCalledWith(gqlContaining('RegisterPush'), {
      endpoint: 'https://push.test/1',
      p256dh: 'p',
      auth: 'a',
    });
    expect(result.current).toMatchObject({
      isPermissionGranted: true,
      subscription: sub,
      isBusy: false,
    });
  });

  it('drops a subscription that has no endpoint or keys', async () => {
    const sub = makeSub({ endpoint: 'https://push.test/1' });
    install({ subscribe: () => Promise.resolve(sub) });
    mockVapid({ publicKey: 'AQAB' });
    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => {
      ok = await result.current.enable();
    });
    expect(ok).toBe(false);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("surfaces the API's message when registering fails", async () => {
    install({});
    mockVapid({ publicKey: 'AQAB' });
    mockRequest.mockRejectedValue({
      response: { errors: [{ message: 'Device limit reached', extensions: { code: 'CONFLICT' } }] },
    });
    const { result } = renderHook(() => usePushNotifications());
    let ok = true;
    await act(async () => {
      ok = await result.current.enable();
    });
    expect(ok).toBe(false);
    expect(result.current.error).toContain('Device limit reached');
    expect(result.current.isBusy).toBe(false);
  });

  it('unregisters and unsubscribes on disable', async () => {
    const existing = makeSub();
    install({ permission: 'granted', existing });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscription).toBe(existing));
    await act(async () => {
      await result.current.disable();
    });
    expect(mockRequest).toHaveBeenCalledWith(gqlContaining('UnregisterPush'), {
      endpoint: 'https://push.test/1',
    });
    expect(existing.unsubscribe).toHaveBeenCalled();
    expect(result.current).toMatchObject({
      subscription: null,
      isPermissionGranted: false,
      isBusy: false,
    });
  });

  it('still clears local state when unregistering fails', async () => {
    const existing = makeSub();
    install({ permission: 'granted', existing });
    mockRequest.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscription).toBe(existing));
    await act(async () => {
      await result.current.disable();
    });
    expect(result.current.subscription).toBeNull();
  });

  it('disable with no subscription only resets the flags', async () => {
    install({ permission: 'granted' });
    const { result } = renderHook(() => usePushNotifications());
    await act(async () => {
      await result.current.disable();
    });
    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.isPermissionGranted).toBe(false);
  });
});
