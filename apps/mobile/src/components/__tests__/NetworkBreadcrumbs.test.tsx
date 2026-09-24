import React from 'react';
import { render } from '@testing-library/react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { NetworkBreadcrumbs } from '../NetworkBreadcrumbs';
import { addBreadcrumb, rememberNetworkConnected } from '../../lib/analytics';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));
jest.mock('../../lib/analytics', () => ({
  addBreadcrumb: jest.fn(),
  rememberNetworkConnected: jest.fn(),
}));

const mockedAddEventListener = jest.mocked(NetInfo.addEventListener);
const mockedAddBreadcrumb = jest.mocked(addBreadcrumb);
const mockedRememberNetworkConnected = jest.mocked(rememberNetworkConnected);

type Listener = (state: NetInfoState) => void;

function netState(overrides: Partial<Record<string, unknown>> = {}): NetInfoState {
  return {
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    // What NetInfo really reports alongside the three fields that are kept.
    details: {
      ssid: 'Home Network',
      bssid: '02:00:00:00:00:00',
      ipAddress: '192.168.1.20',
      subnet: '255.255.255.0',
      carrier: 'Example Mobile',
      isConnectionExpensive: false,
    },
    ...overrides,
  } as unknown as NetInfoState;
}

describe('NetworkBreadcrumbs', () => {
  let emit: Listener;
  const unsubscribe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAddEventListener.mockImplementation((listener) => {
      emit = listener as Listener;
      return unsubscribe;
    });
  });

  it('records the connection state NetInfo reports', async () => {
    await render(<NetworkBreadcrumbs />);

    emit(netState());

    expect(mockedAddBreadcrumb).toHaveBeenCalledWith('Network changed', {
      connected: true,
      reachable: true,
      type: 'wifi',
    });
    expect(mockedRememberNetworkConnected).toHaveBeenCalledWith(true);
  });

  it('never records the SSID, IP address or carrier', async () => {
    await render(<NetworkBreadcrumbs />);

    emit(netState());
    emit(netState({ type: 'cellular' }));

    const serialised = JSON.stringify(mockedAddBreadcrumb.mock.calls);
    for (const leak of ['Home Network', '02:00:00:00:00:00', '192.168.1.20', 'Example Mobile']) {
      expect(serialised).not.toContain(leak);
    }
  });

  it('records going offline and coming back', async () => {
    await render(<NetworkBreadcrumbs />);

    emit(netState());
    emit(netState({ type: 'none', isConnected: false, isInternetReachable: false }));
    emit(netState({ type: 'cellular' }));

    expect(mockedAddBreadcrumb.mock.calls.map(([, props]) => props)).toEqual([
      { connected: true, reachable: true, type: 'wifi' },
      { connected: false, reachable: false, type: 'none' },
      { connected: true, reachable: true, type: 'cellular' },
    ]);
    expect(mockedRememberNetworkConnected).toHaveBeenLastCalledWith(true);
  });

  // A captive portal: connected to Wi-Fi, but nothing beyond it answers.
  it('records a connection that stops reaching the internet', async () => {
    await render(<NetworkBreadcrumbs />);

    emit(netState());
    emit(netState({ isInternetReachable: false }));

    expect(mockedAddBreadcrumb).toHaveBeenLastCalledWith('Network changed', {
      connected: true,
      reachable: false,
      type: 'wifi',
    });
  });

  it('ignores reports where only the details changed', async () => {
    await render(<NetworkBreadcrumbs />);

    emit(netState());
    emit(netState({ details: { ssid: 'Other', ipAddress: '10.0.0.2' } }));
    emit(netState());

    expect(mockedAddBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = await render(<NetworkBreadcrumbs />);

    await unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of its own', async () => {
    const { toJSON } = await render(<NetworkBreadcrumbs />);

    expect(toJSON()).toBeNull();
  });
});
