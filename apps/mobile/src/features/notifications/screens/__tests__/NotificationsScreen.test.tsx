import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useNotificationQueries', () => ({ useNotificationsPage: jest.fn() }));
jest.mock('../../hooks/useNotificationMutations', () => ({
  useMarkNotificationsRead: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useRouter } from 'expo-router';
import { useNotificationsPage } from '../../hooks/useNotificationQueries';
import { useMarkNotificationsRead } from '../../hooks/useNotificationMutations';
import { NotificationsScreen } from '../NotificationsScreen';
import type { NotificationItem } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseNotificationsPage = jest.mocked(useNotificationsPage);
const mockedUseMarkNotificationsRead = jest.mocked(useMarkNotificationsRead);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const notifications: NotificationItem[] = [
  {
    id: '1',
    type: 'interview_reminder',
    title: 'Upcoming interview: Stripe',
    body: 'Your interview is tomorrow.',
    url: '/applications/app-1?section=interviews',
    read: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    type: 'security_alert',
    title: 'New login detected',
    body: 'A new device signed in.',
    url: null,
    read: true,
    createdAt: new Date().toISOString(),
  },
];

function baseInfiniteQueryResult(overrides: Partial<ReturnType<typeof useNotificationsPage>> = {}) {
  return {
    data: { pages: [{ items: notifications, hasNextPage: false, nextCursor: null }] },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    isRefetching: false,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  } as unknown as ReturnType<typeof useNotificationsPage>;
}

function renderScreen(push = jest.fn(), mutate = jest.fn(), back = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push, back } as never);
  mockedUseMarkNotificationsRead.mockReturnValue({ mutate } as never);
  return render(<NotificationsScreen />);
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('renders the notification list', async () => {
    mockedUseNotificationsPage.mockReturnValue(baseInfiniteQueryResult());

    const { findByText } = await renderScreen();

    await findByText('Upcoming interview: Stripe');
    await findByText('New login detected');
  });

  it('marks a notification read, dismisses the modal, and switches to the Applications tab', async () => {
    mockedUseNotificationsPage.mockReturnValue(baseInfiniteQueryResult());
    const push = jest.fn();
    const mutate = jest.fn();
    const back = jest.fn();

    const { getByTestId } = await renderScreen(push, mutate, back);

    await fireEvent.press(getByTestId('notification-row-1'));

    expect(mutate).toHaveBeenCalledWith({ ids: ['1'], isRead: true });
    expect(back).toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/(tabs)/applications/app-1'));
  });

  it('does not navigate for a notification with no url, but still marks it read if unread', async () => {
    mockedUseNotificationsPage.mockReturnValue(baseInfiniteQueryResult());
    const push = jest.fn();
    const mutate = jest.fn();
    const back = jest.fn();

    const { getByTestId } = await renderScreen(push, mutate, back);

    await fireEvent.press(getByTestId('notification-row-2'));

    expect(mutate).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it('marks all unread notifications read', async () => {
    mockedUseNotificationsPage.mockReturnValue(baseInfiniteQueryResult());
    const mutate = jest.fn();

    const { getByTestId } = await renderScreen(jest.fn(), mutate);

    await fireEvent.press(getByTestId('mark-all-read-button'));

    expect(mutate).toHaveBeenCalledWith({ ids: ['1'], isRead: true });
  });

  it('shows an empty state when there are no notifications', async () => {
    mockedUseNotificationsPage.mockReturnValue(
      baseInfiniteQueryResult({
        data: { pages: [{ items: [], hasNextPage: false, nextCursor: null }] },
      } as never),
    );

    const { findByText } = await renderScreen();

    await findByText("You're all caught up.");
  });
});
