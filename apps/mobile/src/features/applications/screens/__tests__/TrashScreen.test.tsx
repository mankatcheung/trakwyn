import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useApplicationQueries', () => ({ useTrashedApplications: jest.fn() }));
jest.mock('../../hooks/useApplicationMutations', () => ({
  useRestoreApplication: jest.fn(),
  usePermanentlyDeleteApplication: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useTrashedApplications } from '../../hooks/useApplicationQueries';
import {
  usePermanentlyDeleteApplication,
  useRestoreApplication,
} from '../../hooks/useApplicationMutations';
import { TrashScreen } from '../TrashScreen';
import type { Application } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseTrashedApplications = jest.mocked(useTrashedApplications);
const mockedUseRestoreApplication = jest.mocked(useRestoreApplication);
const mockedUsePermanentlyDeleteApplication = jest.mocked(usePermanentlyDeleteApplication);
const mockedUseTheme = jest.mocked(useTheme);

const trashed: Application = {
  id: '1',
  company: 'Acme',
  role: 'Backend Engineer',
  status: 'rejected',
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
  deletedAt: '2026-01-05T00:00:00.000Z',
  boardPosition: 0,
  likelyGhosted: false,
};

describe('TrashScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
  });

  it('shows an empty state when trash is empty', async () => {
    mockedUseTrashedApplications.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { findByText } = await render(<TrashScreen />);

    await findByText('Trash is empty.');
  });

  it('restores an application', async () => {
    const restoreMutate = jest.fn();
    mockedUseTrashedApplications.mockReturnValue({
      data: [trashed],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseRestoreApplication.mockReturnValue({
      mutate: restoreMutate,
      isPending: false,
    } as never);
    mockedUsePermanentlyDeleteApplication.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);

    const { getByTestId } = await render(<TrashScreen />);

    await fireEvent.press(getByTestId('restore-button-1'));

    expect(restoreMutate).toHaveBeenCalledWith('1', expect.any(Object));
  });

  it('permanently deletes an application after confirmation', async () => {
    const deleteMutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Delete forever');
      confirm?.onPress?.();
    });
    mockedUseTrashedApplications.mockReturnValue({
      data: [trashed],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseRestoreApplication.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUsePermanentlyDeleteApplication.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as never);

    const { getByTestId } = await render(<TrashScreen />);

    await fireEvent.press(getByTestId('permanently-delete-button-1'));

    expect(deleteMutate).toHaveBeenCalledWith('1', expect.any(Object));
  });
});
