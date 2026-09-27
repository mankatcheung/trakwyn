import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useSegments } from 'expo-router';
import { HangWatchdog } from '../HangWatchdog';
import { startHangWatchdog } from '../../lib/analytics';

jest.mock('expo-router', () => ({ useSegments: jest.fn() }));
jest.mock('../../lib/analytics', () => ({ startHangWatchdog: jest.fn() }));

const mockedUseSegments = jest.mocked(useSegments);
const mockedStart = jest.mocked(startHangWatchdog);

describe('HangWatchdog', () => {
  const stop = jest.fn();
  let emitAppState: (state: AppStateStatus) => void;
  const removeListener = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedStart.mockReturnValue(stop);
    mockedUseSegments.mockReturnValue(['(app)', 'applications'] as never);
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      emitAppState = listener as (state: AppStateStatus) => void;
      return { remove: removeListener } as never;
    });
  });

  it('starts the watchdog in the foreground', async () => {
    await render(<HangWatchdog />);

    expect(mockedStart).toHaveBeenCalledTimes(1);
  });

  it('reads the current route shape at the moment of a hang', async () => {
    const { rerender } = await render(<HangWatchdog />);
    mockedUseSegments.mockReturnValue(['(app)', 'applications', '[id]'] as never);
    await rerender(<HangWatchdog />);

    const { getRoute } = mockedStart.mock.calls[0][0];
    expect(getRoute()).toBe('/(app)/applications/[id]');
    // Navigating does not restart the watchdog.
    expect(mockedStart).toHaveBeenCalledTimes(1);
  });

  it('stops in the background and restarts on return', async () => {
    await render(<HangWatchdog />);

    await act(async () => emitAppState('background'));
    expect(stop).toHaveBeenCalledTimes(1);

    await act(async () => emitAppState('active'));
    expect(mockedStart).toHaveBeenCalledTimes(2);
  });

  it('does not start while launched in the background', async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });

    await render(<HangWatchdog />);

    expect(mockedStart).not.toHaveBeenCalled();
  });

  it('stops and unsubscribes on unmount', async () => {
    const { unmount } = await render(<HangWatchdog />);

    await act(async () => unmount());

    expect(stop).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own', async () => {
    const { toJSON } = await render(<HangWatchdog />);

    expect(toJSON()).toBeNull();
  });
});
