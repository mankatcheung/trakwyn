import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useApplicationQueries', () => ({ useApplication: jest.fn() }));
jest.mock('../../hooks/useApplicationMutations', () => ({ useDeleteApplication: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApplication } from '../../hooks/useApplicationQueries';
import { useDeleteApplication } from '../../hooks/useApplicationMutations';
import { ApplicationDetailScreen } from '../ApplicationDetailScreen';
import type { Application } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseApplication = jest.mocked(useApplication);
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
    jest.clearAllMocks();
  });

  it('renders the application fields', async () => {
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

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Backend Engineer')).toBeTruthy());
    expect(getByText('Acme')).toBeTruthy();
    expect(getByText('Remote')).toBeTruthy();
    expect(getByText('$100k-$120k')).toBeTruthy();
  });

  it('navigates to the edit form when Edit is pressed', async () => {
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

    await fireEvent.press(getByTestId('edit-application-button'));

    expect(push).toHaveBeenCalledWith('./edit');
  });

  it('confirms and deletes the application, then navigates back', async () => {
    const back = jest.fn();
    const mutate = jest.fn((_id, options) => options?.onSuccess?.());
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const deleteButton = buttons?.find((b) => b.text === 'Delete');
      deleteButton?.onPress?.();
    });
    mockedUseApplication.mockReturnValue({
      data: application,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDeleteApplication.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen(jest.fn(), back);

    await fireEvent.press(getByTestId('delete-application-button'));

    expect(mutate).toHaveBeenCalledWith('1', expect.any(Object));
    expect(back).toHaveBeenCalled();
  });
});
