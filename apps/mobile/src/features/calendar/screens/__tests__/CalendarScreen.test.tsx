import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useCalendarQueries', () => ({ useCalendarEvents: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../i18n/LanguageContext', () => ({
  useLanguage: jest.fn(() => ({ mode: 'system', resolvedLanguage: 'en', setMode: jest.fn() })),
}));
import { useRouter } from 'expo-router';
import { useCalendarEvents } from '../../hooks/useCalendarQueries';
import { CalendarScreen } from '../CalendarScreen';
import { dayKey } from '../../lib/calendarGrid';
import type { CalendarEvent } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseCalendarEvents = jest.mocked(useCalendarEvents);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const today = new Date();
const todayKey = dayKey(today);

const events: CalendarEvent[] = [
  {
    id: 'evt-1',
    applicationId: 'app-1',
    company: 'Stripe',
    role: 'Engineer',
    type: 'interview',
    date: today.toISOString(),
    interviewRoundType: 'Onsite',
  },
];

function renderScreen(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<CalendarScreen />);
}

describe('CalendarScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseCalendarEvents.mockReturnValue({
      data: events,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);
  });

  it('shows a hint until a day is selected', async () => {
    const { findByText } = await renderScreen();

    await findByText('Select a day to see its events.');
  });

  it('stretches the view-mode picker to the full device width', async () => {
    const { getByTestId } = await renderScreen();

    const monthChip = getByTestId('calendar-view-month');
    const row = monthChip.parent;

    expect(row?.props.style).not.toContainEqual(
      expect.objectContaining({ alignSelf: 'flex-start' }),
    );
    expect(monthChip.props.style).toContainEqual(expect.objectContaining({ flex: 1 }));
  });

  it('shows events for the selected day and navigates on tap', async () => {
    const push = jest.fn();
    const { getByTestId, findByText } = await renderScreen(push);

    await fireEvent.press(getByTestId(`calendar-day-${todayKey}`));

    await findByText('Interview (Onsite) — Stripe');
    await fireEvent.press(getByTestId('calendar-event-evt-1'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('./applications/app-1'));
  });

  it('switches to day view, showing that day’s events without a day selection', async () => {
    const { getByTestId, findByText } = await renderScreen();

    await fireEvent.press(getByTestId('calendar-view-day'));

    await findByText('Interview (Onsite) — Stripe');
  });

  it('shows a no-events message for a selected day with nothing scheduled', async () => {
    const { getByTestId, findByText } = await renderScreen();

    const otherDay = dayKey(new Date(today.getFullYear(), today.getMonth(), 1));
    // Guard against the 1st happening to be today in a given test run.
    if (otherDay !== todayKey) {
      await fireEvent.press(getByTestId(`calendar-day-${otherDay}`));
      await findByText('No events on this day.');
    }
  });

  it('shows an error state and retries', async () => {
    const refetch = jest.fn();
    mockedUseCalendarEvents.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never);

    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
