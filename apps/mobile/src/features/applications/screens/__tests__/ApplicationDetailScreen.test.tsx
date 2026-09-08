import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useApplicationQueries', () => ({
  useApplication: jest.fn(),
  useApplicationHealthScore: jest.fn(),
  useActivityLogs: jest.fn(),
}));
jest.mock('../../hooks/useApplicationMutations', () => ({ useDeleteApplication: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  useActivityLogs,
  useApplication,
  useApplicationHealthScore,
} from '../../hooks/useApplicationQueries';
import { useDeleteApplication } from '../../hooks/useApplicationMutations';
import { ApplicationDetailScreen } from '../ApplicationDetailScreen';
import type { Application } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseApplication = jest.mocked(useApplication);
const mockedUseApplicationHealthScore = jest.mocked(useApplicationHealthScore);
const mockedUseActivityLogs = jest.mocked(useActivityLogs);
const mockedUseDeleteApplication = jest.mocked(useDeleteApplication);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const application: Application = {
  id: '1',
  company: 'Acme',
  role: 'Backend Engineer',
  status: 'applied',
  jobUrl: 'https://example.com/job',
  location: 'Remote',
  salaryRange: '$100k-$120k',
  description: 'Build things.',
  appliedAt: null,
  starred: false,
  source: null,
  followUpAt: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  boardPosition: 0,
  likelyGhosted: false,
};

function renderScreen(push = jest.fn(), back = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push, back } as never);
  mockedUseLocalSearchParams.mockReturnValue({ id: '1' } as never);
  return render(<ApplicationDetailScreen />);
}

describe('ApplicationDetailScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseApplicationHealthScore.mockReturnValue({ data: undefined } as never);
    mockedUseActivityLogs.mockReturnValue({ data: [] } as never);
    jest.clearAllMocks();
  });

  it('renders the application fields', async () => {
    mockedUseApplication.mockReturnValue({
      data: application,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseApplicationHealthScore.mockReturnValue({ data: undefined } as never);
    mockedUseActivityLogs.mockReturnValue({ data: [] } as never);
    mockedUseDeleteApplication.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Backend Engineer')).toBeTruthy());
    expect(getByText('Acme · Remote · $100k-$120k')).toBeTruthy();
  });

  it('shows the health score when available', async () => {
    mockedUseApplication.mockReturnValue({
      data: application,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseApplicationHealthScore.mockReturnValue({
      data: { score: 82, label: 'Strong' },
    } as never);
    mockedUseActivityLogs.mockReturnValue({ data: [] } as never);
    mockedUseDeleteApplication.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);

    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('health-score-card')).toBeTruthy());
    expect(getByText('82 / 100')).toBeTruthy();
  });

  it('navigates to the edit form from the actions menu', async () => {
    const push = jest.fn();
    mockedUseApplication.mockReturnValue({
      data: application,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDeleteApplication.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const editButton = buttons?.find((b) => b.text === 'Edit');
      editButton?.onPress?.();
    });

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('application-detail-menu-button'));

    expect(push).toHaveBeenCalledWith('./edit');
  });

  it('confirms and deletes the application from the actions menu, then navigates back', async () => {
    const back = jest.fn();
    const mutate = jest.fn((_id, options) => options?.onSuccess?.());
    mockedUseApplication.mockReturnValue({
      data: application,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDeleteApplication.mockReturnValue({ mutate, isPending: false } as never);

    let alertCallCount = 0;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      alertCallCount += 1;
      if (alertCallCount === 1) {
        const moveToTrashButton = buttons?.find((b) => b.text === 'Move to Trash');
        moveToTrashButton?.onPress?.();
      } else {
        const confirmButton = buttons?.find((b) => b.text === 'Delete');
        confirmButton?.onPress?.();
      }
    });

    const { getByTestId } = await renderScreen(jest.fn(), back);

    await fireEvent.press(getByTestId('application-detail-menu-button'));

    expect(mutate).toHaveBeenCalledWith('1', expect.any(Object));
    expect(back).toHaveBeenCalled();
  });

  // This screen is the `[id]/index` route — a bare relative push like
  // './interviews' resolves against the parent of `[id]` in expo-router
  // (dropping applicationId from the URL entirely, 404ing the sub-screen's
  // query), so the id must be spelled out in the pushed path explicitly.
  it.each(['interviews', 'notes', 'documents'])(
    'navigates to the %s section with the applicationId in the path when its tab is pressed',
    async (section) => {
      const push = jest.fn();
      mockedUseApplication.mockReturnValue({
        data: application,
        isLoading: false,
        isError: false,
        error: null,
      } as never);
      mockedUseDeleteApplication.mockReturnValue({
        mutate: jest.fn(),
        isPending: false,
      } as never);

      const { getByTestId } = await renderScreen(push);

      await fireEvent.press(getByTestId(`section-tab-${section}`));

      expect(push).toHaveBeenCalledWith(`./1/${section}`);
    },
  );
});
