import { describe, it, expect, vi, afterEach } from 'vitest';

const { mockToast } = vi.hoisted(() => ({ mockToast: vi.fn() }));

vi.mock('sonner', () => ({ toast: mockToast }));

import { watchForServiceWorkerUpdate } from '#/lib/swUpdateToast';

function makeServiceWorkerContainer(initialController: unknown) {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    controller: initialController,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      (listeners[type] ??= []).push(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    }),
    dispatch(type: string) {
      (listeners[type] ?? []).forEach((l) => l());
    },
  };
}

function stubServiceWorker(container: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
}

describe('watchForServiceWorkerUpdate', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('does not toast on the very first controllerchange for a page with no prior controller', () => {
    const sw = makeServiceWorkerContainer(null);
    stubServiceWorker(sw);

    watchForServiceWorkerUpdate();
    sw.dispatch('controllerchange');

    expect(mockToast).not.toHaveBeenCalled();
  });

  it('toasts on a later controllerchange once a controller was already active', () => {
    const sw = makeServiceWorkerContainer(null);
    stubServiceWorker(sw);

    watchForServiceWorkerUpdate();
    sw.dispatch('controllerchange'); // initial claim — ignored
    sw.dispatch('controllerchange'); // genuine update

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      'A new version of Trakwyn is available.',
      expect.objectContaining({ id: 'sw-update', duration: Infinity }),
    );
  });

  it('toasts immediately if a controller was already active when watching started', () => {
    const sw = makeServiceWorkerContainer({});
    stubServiceWorker(sw);

    watchForServiceWorkerUpdate();
    sw.dispatch('controllerchange');

    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('reloads the page when the Refresh action is clicked', () => {
    const sw = makeServiceWorkerContainer({});
    stubServiceWorker(sw);
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    watchForServiceWorkerUpdate();
    sw.dispatch('controllerchange');

    const [, options] = mockToast.mock.calls[0] as [string, { action: { onClick: () => void } }];
    options.action.onClick();

    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('returns a cleanup function that removes the listener', () => {
    const sw = makeServiceWorkerContainer({});
    stubServiceWorker(sw);

    const cleanup = watchForServiceWorkerUpdate();
    cleanup();

    expect(sw.removeEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function));
  });

  it('is a no-op when service workers are not supported', () => {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;

    const cleanup = watchForServiceWorkerUpdate();

    expect(() => cleanup()).not.toThrow();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
