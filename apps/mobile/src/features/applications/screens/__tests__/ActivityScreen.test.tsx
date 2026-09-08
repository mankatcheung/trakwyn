import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useApplicationQueries', () => ({ useActivityLogs: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams } from 'expo-router';
import { useActivityLogs } from '../../hooks/useApplicationQueries';
import { ActivityScreen } from '../ActivityScreen';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseActivityLogs = jest.mocked(useActivityLogs);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  return render(<ActivityScreen />);
}

describe('ActivityScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('renders the activity timeline', async () => {
    mockedUseActivityLogs.mockReturnValue({
      data: [
        {
          id: 'a1',
          eventType: 'status_changed',
          payload: JSON.stringify({ from: 'applied', to: 'interviewing' }),
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('activity-timeline')).toBeTruthy());
    expect(getByText(/applied → interviewing/)).toBeTruthy();
  });

  it('shows the empty state when there is no activity', async () => {
    mockedUseActivityLogs.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByText } = await renderScreen();

    expect(getByText('No activity yet.')).toBeTruthy();
  });
});
