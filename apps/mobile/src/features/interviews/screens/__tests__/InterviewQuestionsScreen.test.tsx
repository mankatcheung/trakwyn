import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useInterviewQuestionQueries', () => ({ useInterviewQuestions: jest.fn() }));
jest.mock('../../hooks/useInterviewQueries', () => ({ useInterviewRounds: jest.fn() }));
jest.mock('../../hooks/useInterviewQuestionMutations', () => ({
  useCreateInterviewQuestion: jest.fn(),
  useUpdateInterviewQuestion: jest.fn(),
  useDeleteInterviewQuestion: jest.fn(),
  useReorderInterviewQuestions: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useLocalSearchParams } from 'expo-router';
import { useInterviewQuestions } from '../../hooks/useInterviewQuestionQueries';
import { useInterviewRounds } from '../../hooks/useInterviewQueries';
import {
  useCreateInterviewQuestion,
  useDeleteInterviewQuestion,
  useReorderInterviewQuestions,
  useUpdateInterviewQuestion,
} from '../../hooks/useInterviewQuestionMutations';
import { InterviewQuestionsScreen } from '../InterviewQuestionsScreen';
import type { InterviewQuestion, InterviewRound } from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseQuestions = jest.mocked(useInterviewQuestions);
const mockedUseRounds = jest.mocked(useInterviewRounds);
const mockedUseCreate = jest.mocked(useCreateInterviewQuestion);
const mockedUseUpdate = jest.mocked(useUpdateInterviewQuestion);
const mockedUseDelete = jest.mocked(useDeleteInterviewQuestion);
const mockedUseReorder = jest.mocked(useReorderInterviewQuestions);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const makeRound = (overrides: Partial<InterviewRound> = {}): InterviewRound => ({
  id: 'round-1',
  applicationId: 'app-1',
  type: 'technical',
  scheduledAt: null,
  completedAt: '2026-01-02T00:00:00.000Z',
  interviewerName: null,
  notes: null,
  // A finished round: the log has to stay usable once the interview is over.
  outcome: 'passed',
  questionCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeQuestion = (overrides: Partial<InterviewQuestion> = {}): InterviewQuestion => ({
  id: 'q1',
  interviewRoundId: 'round-1',
  question: 'Describe a hard bug.',
  answer: 'A race in the cache layer.',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const QUESTIONS = [
  makeQuestion({ id: 'q1', question: 'First question', position: 0 }),
  makeQuestion({ id: 'q2', question: 'Second question', answer: null, position: 1 }),
  makeQuestion({ id: 'q3', question: 'Third question', answer: 'Third answer', position: 2 }),
];

const createMutate = jest.fn();
const updateMutate = jest.fn();
const deleteMutate = jest.fn();
const reorderMutate = jest.fn();

function givenQuestions(questions: InterviewQuestion[], round: InterviewRound = makeRound()) {
  mockedUseRounds.mockReturnValue({ data: [round] } as never);
  mockedUseQuestions.mockReturnValue({
    data: questions,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1', roundId: 'round-1' } as never);
  return render(<InterviewQuestionsScreen />);
}

describe('InterviewQuestionsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    mockedUseCreate.mockReturnValue({ mutate: createMutate, isPending: false } as never);
    mockedUseUpdate.mockReturnValue({ mutate: updateMutate, isPending: false } as never);
    mockedUseDelete.mockReturnValue({ mutate: deleteMutate, isPending: false } as never);
    mockedUseReorder.mockReturnValue({ mutate: reorderMutate, isPending: false } as never);
    givenQuestions(QUESTIONS);
  });

  describe('listing', () => {
    it('shows each question with its response and how much of the limit is used', async () => {
      const { getByText, getByTestId } = await renderScreen();

      expect(getByText('First question')).toBeTruthy();
      expect(getByText('A race in the cache layer.')).toBeTruthy();
      expect(getByText('Third answer')).toBeTruthy();
      expect(getByTestId('question-usage').props.children).toContain('3 of 50 used');
    });

    it('marks a question that has no response yet', async () => {
      const { getAllByText } = await renderScreen();

      expect(getAllByText('No response recorded yet.')).toHaveLength(1);
    });

    it('shows an empty state when the round has no questions', async () => {
      givenQuestions([], makeRound({ questionCount: 0 }));

      const { findByText } = await renderScreen();

      await findByText('No questions yet');
    });

    it('shows a spinner while loading and the error when loading fails', async () => {
      mockedUseQuestions.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { response: { errors: [{ message: 'Forbidden' }] } },
      } as never);

      const { queryByText } = await renderScreen();

      expect(queryByText('No questions yet')).toBeNull();
    });
  });

  describe('adding', () => {
    it('opens an empty form from the floating action button', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('add-question-button'));

      expect(getByTestId('question-input').props.value).toBe('');
      expect(getByTestId('answer-input').props.value).toBe('');
    });

    it('will not save until there is a question', async () => {
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-question-button'));

      await fireEvent.press(getByTestId('question-form-save-button'));
      expect(createMutate).not.toHaveBeenCalled();

      await fireEvent.changeText(getByTestId('question-input'), '   ');
      await fireEvent.press(getByTestId('question-form-save-button'));
      expect(createMutate).not.toHaveBeenCalled();
    });

    it('saves a question without a response', async () => {
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-question-button'));

      await fireEvent.changeText(getByTestId('question-input'), 'Why us?');
      await fireEvent.press(getByTestId('question-form-save-button'));

      expect(createMutate).toHaveBeenCalledWith(
        { question: 'Why us?', answer: '' },
        expect.any(Object),
      );
    });

    it('saves a question together with its response', async () => {
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-question-button'));

      await fireEvent.changeText(getByTestId('question-input'), 'Why us?');
      await fireEvent.changeText(getByTestId('answer-input'), 'The product.');
      await fireEvent.press(getByTestId('question-form-save-button'));

      expect(createMutate).toHaveBeenCalledWith(
        { question: 'Why us?', answer: 'The product.' },
        expect.any(Object),
      );
    });

    it('closes the form once the question is saved', async () => {
      createMutate.mockImplementation((_data, options) => options.onSuccess());
      const { getByTestId, queryByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-question-button'));

      await fireEvent.changeText(getByTestId('question-input'), 'Why us?');
      await fireEvent.press(getByTestId('question-form-save-button'));

      await waitFor(() => expect(queryByTestId('question-input')).toBeNull());
    });

    it('reports a failure to save', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      createMutate.mockImplementation((_data, options) =>
        options.onError({
          response: { errors: [{ message: 'This round is full', extensions: { code: 'X' } }] },
        }),
      );
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-question-button'));

      await fireEvent.changeText(getByTestId('question-input'), 'Why us?');
      await fireEvent.press(getByTestId('question-form-save-button'));

      expect(alert).toHaveBeenCalledWith('Could not save', expect.any(String));
    });

    it('explains the limit instead of opening the form when the round is full', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      givenQuestions(QUESTIONS, makeRound({ questionCount: 50 }));
      const { getByTestId, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('add-question-button'));

      expect(alert).toHaveBeenCalledWith(
        'Question limit reached',
        expect.stringContaining('maximum of 50 questions'),
      );
      expect(queryByTestId('question-input')).toBeNull();
    });
  });

  describe('editing', () => {
    it('opens the form filled with the question and its response', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('edit-question-q1'));

      expect(getByTestId('question-input').props.value).toBe('First question');
      expect(getByTestId('answer-input').props.value).toBe('A race in the cache layer.');
    });

    it('fills in the response of a question that had none', async () => {
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('edit-question-q2'));
      expect(getByTestId('answer-input').props.value).toBe('');

      await fireEvent.changeText(getByTestId('answer-input'), 'In hindsight…');
      await fireEvent.press(getByTestId('question-form-save-button'));

      expect(updateMutate).toHaveBeenCalledWith(
        { id: 'q2', data: { question: 'Second question', answer: 'In hindsight…' } },
        expect.any(Object),
      );
    });
  });

  describe('deleting', () => {
    it('asks first, then deletes the question', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('delete-question-q2'));

      expect(deleteMutate).not.toHaveBeenCalled();
      const buttons = alert.mock.calls[0][2] ?? [];
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
      expect(deleteMutate).toHaveBeenCalledWith('q2', expect.any(Object));
    });
  });

  describe('reordering', () => {
    it('moves a question down', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('move-question-down-q1'));

      expect(reorderMutate).toHaveBeenCalledWith(['q2', 'q1', 'q3'], expect.any(Object));
    });

    it('moves a question up', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('move-question-up-q3'));

      expect(reorderMutate).toHaveBeenCalledWith(['q1', 'q3', 'q2'], expect.any(Object));
    });

    it('cannot move the first question up or the last one down', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('move-question-up-q1'));
      await fireEvent.press(getByTestId('move-question-down-q3'));

      expect(reorderMutate).not.toHaveBeenCalled();
    });
  });
});
