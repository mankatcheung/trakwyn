import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../../../features/notifications/hooks/useNotificationQueries', () => ({
  useUnreadNotificationCount: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useRouter } from 'expo-router';
import { useUnreadNotificationCount } from '../../../features/notifications/hooks/useNotificationQueries';
import { NotificationBell } from '../NotificationBell';
import { useTheme } from '../../../theme/ThemeContext';
import { lightColors } from '../../../theme/colors';

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseUnreadNotificationCount = jest.mocked(useUnreadNotificationCount);
const mockedUseTheme = jest.mocked(useTheme);

describe('NotificationBell', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('opens the notifications modal when pressed', async () => {
    const push = jest.fn();
    mockedUseRouter.mockReturnValue({ push } as never);
    mockedUseUnreadNotificationCount.mockReturnValue({ data: 0 } as never);

    const { getByTestId } = await render(<NotificationBell />);

    fireEvent.press(getByTestId('notification-bell'));

    expect(push).toHaveBeenCalledWith('/notifications');
  });

  it('shows a badge with the unread count', async () => {
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseUnreadNotificationCount.mockReturnValue({ data: 3 } as never);

    const { getByTestId, getByText } = await render(<NotificationBell />);

    expect(getByTestId('notification-bell-badge')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('caps the badge at 9+', async () => {
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseUnreadNotificationCount.mockReturnValue({ data: 12 } as never);

    const { getByText } = await render(<NotificationBell />);

    expect(getByText('9+')).toBeTruthy();
  });

  it('hides the badge when there are no unread notifications', async () => {
    mockedUseRouter.mockReturnValue({ push: jest.fn() } as never);
    mockedUseUnreadNotificationCount.mockReturnValue({ data: 0 } as never);

    const { queryByTestId } = await render(<NotificationBell />);

    expect(queryByTestId('notification-bell-badge')).toBeNull();
  });
});
