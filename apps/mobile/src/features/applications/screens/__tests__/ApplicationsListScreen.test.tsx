import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useApplicationQueries', () => ({ useApplications: jest.fn() }));
jest.mock('../../hooks/useApplicationMutations', () => ({
  useMoveApplicationOnBoard: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  Stack: { Screen: () => null },
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
import { useRouter } from 'expo-router';
import { useApplications } from '../../hooks/useApplicationQueries';
import { useMoveApplicationOnBoard } from '../../hooks/useApplicationMutations';
import { ApplicationsListScreen } from '../ApplicationsListScreen';
import type { Application } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseApplications = jest.mocked(useApplications);
const mockedUseMoveApplicationOnBoard = jest.mocked(useMoveApplicationOnBoard);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const applications: Application[] = [
  {
    id: '1',
    company: 'Acme',
    role: 'Backend Engineer',
    status: 'applied',
    jobUrl: null,
    location: 'Remote',
    salaryRange: null,
    description: null,
    appliedAt: null,
    starred: true,
    source: null,
    followUpAt: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    boardPosition: 0,
    likelyGhosted: false,
  },
  {
    id: '2',
    company: 'Globex',
    role: 'Frontend Engineer',
    status: 'interviewing',
    jobUrl: null,
    location: null,
    salaryRange: null,
    description: null,
    appliedAt: null,
    starred: false,
    source: null,
    followUpAt: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    boardPosition: 0,
    likelyGhosted: true,
  },
];

function renderScreen(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<ApplicationsListScreen />);
}

describe('ApplicationsListScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseMoveApplicationOnBoard.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
  });

  it('renders the list of applications', async () => {
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Backend Engineer')).toBeTruthy());
    expect(getByText('Frontend Engineer')).toBeTruthy();
  });

  it('navigates to the detail screen when an item is pressed', async () => {
    const push = jest.fn();
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('application-item-1'));

    expect(push).toHaveBeenCalledWith('/applications/1');
  });

  it('filters the list by search text', async () => {
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId, queryByText } = await renderScreen();

    await fireEvent.changeText(getByTestId('applications-search-input'), 'globex');

    await waitFor(() => expect(queryByText('Backend Engineer')).toBeNull());
    expect(queryByText('Frontend Engineer')).toBeTruthy();
  });

  it('navigates to the create form when the add button is pressed', async () => {
    const push = jest.fn();
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('add-application-button'));

    expect(push).toHaveBeenCalledWith('/applications/new');
  });

  it('shows an empty state when there are no applications', async () => {
    mockedUseApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { findByText } = await renderScreen();

    await findByText('No applications yet.');
  });

  it('toggles to the board view without navigating', async () => {
    const push = jest.fn();
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId, findByTestId, queryByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('applications-view-board'));

    await findByTestId('board-column-applied');
    expect(queryByTestId('applications-search-input')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates to the trash screen when the trash button is pressed', async () => {
    const push = jest.fn();
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('applications-trash-button'));

    expect(push).toHaveBeenCalledWith('/applications/trash');
  });

  it('filters the list to starred applications only', async () => {
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId, queryByText } = await renderScreen();

    await fireEvent.press(getByTestId('applications-filter-starred'));

    await waitFor(() => expect(queryByText('Frontend Engineer')).toBeNull());
    expect(queryByText('Backend Engineer')).toBeTruthy();

    await fireEvent.press(getByTestId('applications-filter-starred'));
    await waitFor(() => expect(queryByText('Frontend Engineer')).toBeTruthy());
  });

  it('filters the list to likely-ghosted applications only', async () => {
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId, queryByText } = await renderScreen();

    await fireEvent.press(getByTestId('applications-filter-ghosted'));

    await waitFor(() => expect(queryByText('Backend Engineer')).toBeNull());
    expect(queryByText('Frontend Engineer')).toBeTruthy();
  });

  it('opens the display fields picker and hides a field when toggled off', async () => {
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      isRefetching: false,
    } as never);

    const { getByTestId, queryByText } = await renderScreen();

    await fireEvent.press(getByTestId('applications-display-fields-button'));
    await fireEvent.press(getByTestId('display-field-role'));

    await waitFor(() => expect(queryByText('Backend Engineer')).toBeNull());
    expect(queryByText('Frontend Engineer')).toBeNull();
  });
});
