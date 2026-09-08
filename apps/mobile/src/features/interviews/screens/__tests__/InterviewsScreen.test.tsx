import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useInterviewQueries', () => ({ useInterviewRounds: jest.fn() }));
jest.mock('../../hooks/useInterviewMutations', () => ({
  useCreateInterviewRound: jest.fn(),
  useUpdateInterviewRound: jest.fn(),
  useDeleteInterviewRound: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInterviewRounds } from '../../hooks/useInterviewQueries';
import {
  useCreateInterviewRound,
  useDeleteInterviewRound,
  useUpdateInterviewRound,
} from '../../hooks/useInterviewMutations';
import { InterviewsScreen } from '../InterviewsScreen';
import type { InterviewRound } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseInterviewRounds = jest.mocked(useInterviewRounds);
const mockedUseCreateInterviewRound = jest.mocked(useCreateInterviewRound);
const mockedUseUpdateInterviewRound = jest.mocked(useUpdateInterviewRound);
const mockedUseDeleteInterviewRound = jest.mocked(useDeleteInterviewRound);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseRouter = jest.mocked(useRouter);
const mockedUseTheme = jest.mocked(useTheme);

const round: InterviewRound = {
  id: 'round-1',
  applicationId: 'app-1',
  type: 'technical',
  scheduledAt: null,
  completedAt: null,
  interviewerName: 'Marcus Lin',
  notes: 'Strong on system design.',
  outcome: 'passed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderScreen(push = jest.fn()) {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1' } as never);
  mockedUseRouter.mockReturnValue({ push } as never);
  return render(<InterviewsScreen />);
}

describe('InterviewsScreen', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseCreateInterviewRound.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseUpdateInterviewRound.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
    mockedUseDeleteInterviewRound.mockReturnValue({ mutate: jest.fn(), isPending: false } as never);
  });

  it('shows an empty state when there are no rounds', async () => {
    mockedUseInterviewRounds.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { findByText } = await renderScreen();

    await findByText('No interview rounds yet.');
  });

  it('renders existing interview rounds', async () => {
    mockedUseInterviewRounds.mockReturnValue({
      data: [round],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('interview-round-round-1')).toBeTruthy());
    expect(getByText('With Marcus Lin')).toBeTruthy();
    expect(getByText('Strong on system design.')).toBeTruthy();
  });

  it('creates a new interview round via the form', async () => {
    mockedUseInterviewRounds.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    const mutate = jest.fn((_data, options) => options?.onSuccess?.());
    mockedUseCreateInterviewRound.mockReturnValue({ mutate, isPending: false } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('add-round-button'));
    await fireEvent.press(getByTestId('interview-type-onsite'));
    await fireEvent.press(getByTestId('interview-form-save-button'));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'onsite' }),
      expect.any(Object),
    );
  });

  it('deletes a round after confirmation', async () => {
    const deleteMutate = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Delete');
      confirm?.onPress?.();
    });
    mockedUseInterviewRounds.mockReturnValue({
      data: [round],
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockedUseDeleteInterviewRound.mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('delete-round-round-1'));

    expect(deleteMutate).toHaveBeenCalledWith('round-1', expect.any(Object));
  });

  it('navigates to Notes when its tab is pressed', async () => {
    const push = jest.fn();
    mockedUseInterviewRounds.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as never);

    const { getByTestId } = await renderScreen(push);

    await fireEvent.press(getByTestId('section-tab-notes'));

    expect(push).toHaveBeenCalledWith('./notes');
  });
});
