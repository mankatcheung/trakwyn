import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, type Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  connectPopupPort,
  createUpdateReloader,
  registerUpdateReload,
  type UpdateReloader,
} from './updateReload';
import { RUNTIME_PORTS, UPDATE_RELOAD_RETRY_MS } from '../constants';

/** Lets the reloader's async checks (the pending-login read) settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

let reload: ReturnType<typeof vi.fn<() => void>>;
let tabLoginPending: boolean;
let reloader: UpdateReloader;

beforeEach(() => {
  vi.useFakeTimers();
  reload = vi.fn<() => void>();
  tabLoginPending = false;
  reloader = createUpdateReloader({
    reload,
    hasPendingTabLogin: async () => tabLoginPending,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Work that stays in flight until the returned `finish` is called. */
function inFlight(): { finish: () => void; done: Promise<void> } {
  let finish!: () => void;
  const done = reloader.track(() => new Promise<void>((resolve) => (finish = resolve)));
  return { finish, done };
}

describe('createUpdateReloader', () => {
  it('does nothing until an update is available', async () => {
    reloader.popupOpened();
    reloader.popupClosed();
    await reloader.track(async () => undefined);
    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS * 3);

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads at once when the Clipper is idle', async () => {
    reloader.updateAvailable();
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits while the popup is open, and reloads when it closes', async () => {
    reloader.popupOpened();
    reloader.updateAvailable();
    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS * 2);
    expect(reload).not.toHaveBeenCalled();

    reloader.popupClosed();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('waits until every open popup has closed', async () => {
    reloader.popupOpened();
    reloader.popupOpened();
    reloader.updateAvailable();

    reloader.popupClosed();
    await settle();
    expect(reload).not.toHaveBeenCalled();

    reloader.popupClosed();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // A reload empties storage.session. Mid-refresh, the API has already rotated
  // the refresh token, so losing the new one makes the next refresh look like
  // reuse and revokes the session.
  it('waits for a sign-in or refresh in flight, and reloads when it finishes', async () => {
    const work = inFlight();
    reloader.updateAvailable();
    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS * 2);
    expect(reload).not.toHaveBeenCalled();

    work.finish();
    await work.done;
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('counts work that fails as finished', async () => {
    reloader.updateAvailable();
    const failed = reloader.track(async () => {
      throw new Error('refresh failed');
    });

    await expect(failed).rejects.toThrow('refresh failed');
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('returns what the tracked work returns', async () => {
    await expect(reloader.track(async () => 'token')).resolves.toBe('token');
  });

  it('waits for a pending tab sign-in, and reloads on a later check once it has finished', async () => {
    tabLoginPending = true;
    reloader.updateAvailable();
    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS);
    expect(reload).not.toHaveBeenCalled();

    tabLoginPending = false;
    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload if the popup opens while the pending-login check is running', async () => {
    let answer!: (pending: boolean) => void;
    reloader = createUpdateReloader({
      reload,
      hasPendingTabLogin: () => new Promise((resolve) => (answer = resolve)),
    });

    reloader.updateAvailable();
    reloader.popupOpened();
    answer(false);
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads only once', async () => {
    reloader.updateAvailable();
    reloader.updateAvailable();
    await settle();
    reloader.popupOpened();
    reloader.popupClosed();
    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS * 3);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('treats a failed pending-login read as busy and tries again later', async () => {
    let reads = 0;
    reloader = createUpdateReloader({
      reload,
      hasPendingTabLogin: async () => {
        reads += 1;
        if (reads === 1) throw new Error('storage unavailable');
        return false;
      },
    });

    reloader.updateAvailable();
    await settle();
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(UPDATE_RELOAD_RETRY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('registerUpdateReload', () => {
  type ConnectListener = (port: Browser.runtime.Port) => void;

  /** A popup port whose disconnect the test fires. */
  function fakePort(name: string): { port: Browser.runtime.Port; disconnect: () => void } {
    const listeners: Array<() => void> = [];
    const port = {
      name,
      onDisconnect: { addListener: (listener: () => void) => listeners.push(listener) },
    } as unknown as Browser.runtime.Port;
    return { port, disconnect: () => listeners.forEach((listener) => listener()) };
  }

  let connect: ConnectListener;
  let fake: UpdateReloader;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(browser.runtime.onConnect, 'addListener').mockImplementation((listener) => {
      connect = listener as ConnectListener;
    });
    fake = {
      updateAvailable: vi.fn(),
      popupOpened: vi.fn(),
      popupClosed: vi.fn(),
      track: vi.fn(),
    };
    registerUpdateReload(fake);
  });

  it('hands a downloaded update to the reloader', async () => {
    await fakeBrowser.runtime.onUpdateAvailable.trigger({ version: '1.3.0' });

    expect(fake.updateAvailable).toHaveBeenCalledTimes(1);
  });

  it('counts the popup open while its port is connected', () => {
    const popup = fakePort(RUNTIME_PORTS.POPUP);

    connect(popup.port);
    expect(fake.popupOpened).toHaveBeenCalledTimes(1);
    expect(fake.popupClosed).not.toHaveBeenCalled();

    popup.disconnect();
    expect(fake.popupClosed).toHaveBeenCalledTimes(1);
  });

  it('ignores a port that is not the popup', () => {
    connect(fakePort('something-else').port);

    expect(fake.popupOpened).not.toHaveBeenCalled();
  });
});

describe('connectPopupPort', () => {
  /** Ports handed out by a stubbed `runtime.connect`, newest last. */
  let ports: Array<{ name?: string; disconnect: () => void }>;

  beforeEach(() => {
    fakeBrowser.reset();
    ports = [];
    vi.spyOn(browser.runtime, 'connect').mockImplementation((info) => {
      const listeners: Array<() => void> = [];
      ports.push({
        name: (info as { name?: string }).name,
        disconnect: () => listeners.forEach((listener) => listener()),
      });
      return {
        onDisconnect: { addListener: (listener: () => void) => listeners.push(listener) },
      } as unknown as Browser.runtime.Port;
    });
  });

  it('opens the popup port', () => {
    connectPopupPort();

    expect(ports.map((port) => port.name)).toEqual([RUNTIME_PORTS.POPUP]);
  });

  it('opens it again when a restarted background drops it', async () => {
    connectPopupPort();
    ports[0]!.disconnect();
    await settle();

    expect(ports).toHaveLength(2);
  });

  it('does not reconnect once the extension itself is gone', async () => {
    connectPopupPort();
    vi.spyOn(browser.runtime, 'id', 'get').mockReturnValue(undefined as unknown as string);
    ports[0]!.disconnect();
    await settle();

    expect(ports).toHaveLength(1);
  });
});
