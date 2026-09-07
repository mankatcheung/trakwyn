import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useApplicationQueries', () => ({ useApplications: jest.fn() }));
jest.mock('../../hooks/useApplicationMutations', () => ({
  useMoveApplicationOnBoard: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useRouter } from 'expo-router';
import { useApplications } from '../../hooks/useApplicationQueries';
import { useMoveApplicationOnBoard } from '../../hooks/useApplicationMutations';
import { BoardScreen } from '../BoardScreen';
import type { Application } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseApplications = jest.mocked(useApplications);
const mockedUseMoveApplicationOnBoard = jest.mocked(useMoveApplicationOnBoard);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const applications: Application[] = [
  {
    id: 'app-1',
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    boardPosition: 0,
    likelyGhosted: false,
  },
  {
    id: 'app-2',
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
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    boardPosition: 0,
    likelyGhosted: false,
  },
];

function renderScreen(push = jest.fn()) {
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<BoardScreen />);
}

describe('BoardScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseApplications.mockReturnValue({
      data: applications,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  });

  it('groups applications into their status columns', async () => {
    mockedUseMoveApplicationOnBoard.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);

    const { findByTestId, findByText } = await renderScreen();

    await findByTestId('board-column-applied');
    await findByText('★ Acme');
    await findByText('Globex');
  });

  it('navigates to the application on tap', async () => {
    mockedUseMoveApplicationOnBoard.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    const push = jest.fn();

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('board-card-app-1'));

    expect(push).toHaveBeenCalledWith('./app-1');
  });

  it('navigates to the new application form when the new button is pressed', async () => {
    mockedUseMoveApplicationOnBoard.mockReturnValue({
      mutateAsync: jest.fn(),
      isPending: false,
    } as never);
    const push = jest.fn();

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('board-new-application-button'));

    expect(push).toHaveBeenCalledWith('./new');
  });

  it('moves a card to a different column via the move modal', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({});
    mockedUseMoveApplicationOnBoard.mockReturnValue({ mutateAsync, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('move-card-app-1'));
    await fireEvent.press(getByTestId('move-to-interviewing'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        applicationId: 'app-1',
        toStatus: 'interviewing',
        orderedIds: ['app-2', 'app-1'],
      }),
    );
  });
});
