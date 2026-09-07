import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../applications/hooks/useApplicationQueries', () => ({
  useApplications: jest.fn(),
}));
jest.mock('../../hooks/useDashboardQueries', () => ({
  useDashboardCalendarEvents: jest.fn(),
  useWeeklyApplicationGoal: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useRouter } from 'expo-router';
import { useApplications } from '../../../applications/hooks/useApplicationQueries';
import {
  useDashboardCalendarEvents,
  useWeeklyApplicationGoal,
} from '../../hooks/useDashboardQueries';
import { DashboardScreen } from '../DashboardScreen';
import type { Application } from '../../../applications/types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseApplications = jest.mocked(useApplications);
const mockedUseCalendarEvents = jest.mocked(useDashboardCalendarEvents);
const mockedUseGoal = jest.mocked(useWeeklyApplicationGoal);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const applications: Application[] = [
  {
    id: '1',
    company: 'Acme',
    role: 'Backend Engineer',
    status: 'applied',
    jobUrl: null,
    location: null,
    salaryRange: null,
    description: null,
    appliedAt: null,
    starred: true,
    source: null,
    followUpAt: null,
    tags: [],
    boardPosition: 0,
    likelyGhosted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function renderScreen(push = jest.fn(), replace = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push, replace } as never);
  return render(<DashboardScreen />);
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseCalendarEvents.mockReturnValue({ data: [] } as never);
    mockedUseGoal.mockReturnValue({ data: undefined } as never);
  });

  it('shows stat counts and recent applications', async () => {
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);

    const { findByText, getByTestId } = await renderScreen();

    await findByText('★ Acme');
    expect(getByTestId('stat-card-Total')).toBeTruthy();
  });

  it('shows the weekly goal progress when present', async () => {
    mockedUseApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);
    mockedUseGoal.mockReturnValue({
      data: {
        weeklyApplicationGoal: 5,
        currentWeekCount: 2,
        currentWeekStart: '2026-01-01T00:00:00.000Z',
        streakWeeks: 3,
      },
    } as never);

    const { findByText } = await renderScreen();

    await findByText('2 of 5 applications this week');
    await findByText('3-week streak');
  });

  it('shows upcoming events and navigates to the linked application', async () => {
    mockedUseApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);
    mockedUseCalendarEvents.mockReturnValue({
      data: [
        {
          id: 'evt-1',
          applicationId: 'app-1',
          company: 'Stripe',
          role: 'Engineer',
          type: 'interview',
          date: new Date(Date.now() + 86_400_000).toISOString(),
          interviewRoundType: null,
        },
      ],
    } as never);
    const push = jest.fn();

    const { findByTestId } = await renderScreen(push);

    const row = await findByTestId('upcoming-event-evt-1');
    await fireEvent.press(row);

    await waitFor(() => expect(push).toHaveBeenCalledWith('./applications/app-1'));
  });

  it('navigates to the Calendar tab from the upcoming section', async () => {
    mockedUseApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);
    mockedUseCalendarEvents.mockReturnValue({
      data: [
        {
          id: 'evt-1',
          applicationId: 'app-1',
          company: 'Stripe',
          role: 'Engineer',
          type: 'interview',
          date: new Date(Date.now() + 86_400_000).toISOString(),
          interviewRoundType: null,
        },
      ],
    } as never);
    const push = jest.fn();

    const { findByTestId } = await renderScreen(push);

    await fireEvent.press(await findByTestId('dashboard-view-calendar'));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/(tabs)/calendar'));
  });

  it('shows an empty state when there are no applications', async () => {
    mockedUseApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);

    const { findByText } = await renderScreen();

    await findByText('No applications yet. Add your first one.');
  });
});
