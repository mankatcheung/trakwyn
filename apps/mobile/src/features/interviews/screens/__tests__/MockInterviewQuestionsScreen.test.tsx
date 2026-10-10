import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../hooks/useMockInterviewQuestionQueries', () => ({
  useMockInterviewQuestions: jest.fn(),
}));
jest.mock('../../hooks/useInterviewQueries', () => ({ useInterviewRounds: jest.fn() }));
jest.mock('../../hooks/useMockInterviewQuestionMutations', () => ({
  useCreateMockInterviewQuestion: jest.fn(),
  useUpdateMockInterviewQuestion: jest.fn(),
  useDeleteMockInterviewQuestion: jest.fn(),
  useReorderMockInterviewQuestions: jest.fn(),
  useGenerateMockInterviewAnswer: jest.fn(),
  useGenerateMockInterviewQuestions: jest.fn(),
  useAddMockInterviewQuestions: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  Stack: { Screen: () => null },
}));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useLocalSearchParams } from 'expo-router';
import { useMockInterviewQuestions } from '../../hooks/useMockInterviewQuestionQueries';
import { useInterviewRounds } from '../../hooks/useInterviewQueries';
import {
  useAddMockInterviewQuestions,
  useCreateMockInterviewQuestion,
  useDeleteMockInterviewQuestion,
  useGenerateMockInterviewAnswer,
  useGenerateMockInterviewQuestions,
  useReorderMockInterviewQuestions,
  useUpdateMockInterviewQuestion,
} from '../../hooks/useMockInterviewQuestionMutations';
import { MockInterviewQuestionsScreen } from '../MockInterviewQuestionsScreen';
import type {
  GeneratedMockAnswer,
  GeneratedMockQuestions,
  InterviewRound,
  MockInterviewQuestion,
} from '../../types';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseQuestions = jest.mocked(useMockInterviewQuestions);
const mockedUseRounds = jest.mocked(useInterviewRounds);
const mockedUseCreate = jest.mocked(useCreateMockInterviewQuestion);
const mockedUseUpdate = jest.mocked(useUpdateMockInterviewQuestion);
const mockedUseDelete = jest.mocked(useDeleteMockInterviewQuestion);
const mockedUseReorder = jest.mocked(useReorderMockInterviewQuestions);
const mockedUseGenerateAnswer = jest.mocked(useGenerateMockInterviewAnswer);
const mockedUseGenerateQuestions = jest.mocked(useGenerateMockInterviewQuestions);
const mockedUseAdd = jest.mocked(useAddMockInterviewQuestions);
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);
const mockedUseTheme = jest.mocked(useTheme);

const makeRound = (overrides: Partial<InterviewRound> = {}): InterviewRound => ({
  id: 'round-1',
  applicationId: 'app-1',
  type: 'technical',
  scheduledAt: null,
  completedAt: null,
  interviewerName: null,
  notes: null,
  outcome: 'pending',
  questionCount: 4,
  mockQuestionCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeQuestion = (overrides: Partial<MockInterviewQuestion> = {}): MockInterviewQuestion => ({
  id: 'q1',
  interviewRoundId: 'round-1',
  question: 'Describe a hard bug.',
  answer: 'A race in the cache layer.',
  answerSource: 'user',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const QUESTIONS = [
  makeQuestion({ id: 'q1', question: 'First question', position: 0 }),
  makeQuestion({
    id: 'q2',
    question: 'Second question',
    answer: 'Drafted by AI',
    answerSource: 'ai',
    position: 1,
  }),
  makeQuestion({ id: 'q3', question: 'Third question', answer: null, position: 2 }),
];

const GENERATED: GeneratedMockQuestions = {
  suggestions: ['Suggested one?', 'Suggested two?', 'Suggested three?'],
  usedJobDescription: true,
  usedBriefing: true,
};

const createMutate = jest.fn();
const updateMutate = jest.fn();
const deleteMutate = jest.fn();
const reorderMutate = jest.fn();
const generateAnswerMutate = jest.fn();
const generateQuestionsMutate = jest.fn();
const addMutate = jest.fn();

function givenQuestions(questions: MockInterviewQuestion[], round: InterviewRound = makeRound()) {
  mockedUseRounds.mockReturnValue({ data: [round] } as never);
  mockedUseQuestions.mockReturnValue({
    data: questions,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

/** The next generate call succeeds with this result, as the mutation's own callback would. */
function givenGeneratedQuestions(result: GeneratedMockQuestions = GENERATED) {
  generateQuestionsMutate.mockImplementation(
    (_prompt: string, options?: { onSuccess?: (r: GeneratedMockQuestions) => void }) =>
      options?.onSuccess?.(result),
  );
}

function givenGeneratedAnswer(result: GeneratedMockAnswer) {
  generateAnswerMutate.mockImplementation(
    (_id: string, options?: { onSuccess?: (r: GeneratedMockAnswer) => void }) =>
      options?.onSuccess?.(result),
  );
}

function renderScreen() {
  mockedUseLocalSearchParams.mockReturnValue({ id: 'app-1', roundId: 'round-1' } as never);
  return render(<MockInterviewQuestionsScreen />);
}

describe('MockInterviewQuestionsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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
    mockedUseGenerateAnswer.mockReturnValue({
      mutate: generateAnswerMutate,
      isPending: false,
      variables: undefined,
    } as never);
    mockedUseGenerateQuestions.mockReturnValue({
      mutate: generateQuestionsMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: jest.fn(),
    } as never);
    mockedUseAdd.mockReturnValue({
      mutate: addMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: jest.fn(),
    } as never);
    givenQuestions(QUESTIONS);
  });

  describe('listing', () => {
    it('says these are practice questions and how much of the limit is used', async () => {
      const { getByText, getByTestId } = await renderScreen();

      expect(getByText(/kept apart from the questions you were actually asked/i)).toBeTruthy();
      expect(getByTestId('practice-usage').props.children).toContain('3 of 30 used');
    });

    it('labels an AI answer, and only an AI answer', async () => {
      const { getByTestId, queryByTestId } = await renderScreen();

      expect(getByTestId('ai-badge-q2')).toBeTruthy();
      expect(queryByTestId('ai-badge-q1')).toBeNull();
      expect(queryByTestId('ai-badge-q3')).toBeNull();
    });

    it('offers to write or generate an answer where there is none', async () => {
      const { getByTestId, getByText } = await renderScreen();

      expect(getByText('No answer yet.')).toBeTruthy();
      expect(getByTestId('write-answer-q3')).toBeTruthy();
      expect(getByTestId('generate-answer-q3')).toBeTruthy();
    });

    it('shows an empty state when the round has no practice questions', async () => {
      givenQuestions([], makeRound({ mockQuestionCount: 0 }));

      const { findByText } = await renderScreen();

      await findByText('Practice questions');
    });
  });

  describe('adding and editing by hand', () => {
    it('saves a practice question together with its answer', async () => {
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-practice-button'));

      await fireEvent.changeText(getByTestId('practice-question-input'), 'Why us?');
      await fireEvent.changeText(getByTestId('practice-answer-input'), 'The product.');
      await fireEvent.press(getByTestId('practice-form-save-button'));

      expect(createMutate).toHaveBeenCalledWith(
        { question: 'Why us?', answer: 'The product.' },
        expect.any(Object),
      );
    });

    it('will not save until there is a question', async () => {
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('add-practice-button'));

      await fireEvent.changeText(getByTestId('practice-question-input'), '   ');
      await fireEvent.press(getByTestId('practice-form-save-button'));

      expect(createMutate).not.toHaveBeenCalled();
    });

    it('sends no answer source when editing, so an AI answer keeps its label', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('edit-practice-q2'));
      await fireEvent.changeText(getByTestId('practice-answer-input'), 'Reworded by me');
      await fireEvent.press(getByTestId('practice-form-save-button'));

      expect(updateMutate).toHaveBeenCalledWith(
        { id: 'q2', data: { question: 'Second question', answer: 'Reworded by me' } },
        expect.any(Object),
      );
      expect(JSON.stringify(updateMutate.mock.calls[0][0])).not.toContain('answerSource');
    });

    it('deletes after confirmation', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('delete-practice-q1'));
      const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      buttons.find((b) => b.text === 'Delete')!.onPress!();

      expect(deleteMutate).toHaveBeenCalledWith('q1', expect.any(Object));
    });
  });

  describe('generating questions', () => {
    it('sends the prompt and shows the suggestions, all selected, without saving any', async () => {
      givenGeneratedQuestions();
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('generate-questions-button'));

      await fireEvent.changeText(getByTestId('generate-prompt-input'), 'system design');
      await fireEvent.press(getByTestId('generate-submit-button'));

      expect(generateQuestionsMutate).toHaveBeenCalledWith('system design', expect.any(Object));
      for (const index of [0, 1, 2]) {
        expect(getByTestId(`suggestion-${index}`).props.accessibilityState.checked).toBe(true);
      }
      expect(getByTestId('add-suggestions-button')).toBeTruthy();
      expect(addMutate).not.toHaveBeenCalled();
    });

    it('saves only the suggestions the user keeps', async () => {
      givenGeneratedQuestions();
      const { getByTestId, getByText } = await renderScreen();
      await fireEvent.press(getByTestId('generate-questions-button'));
      await fireEvent.press(getByTestId('generate-submit-button'));

      await fireEvent.press(getByTestId('suggestion-1'));
      expect(getByText('Add 2 to Practice')).toBeTruthy();
      await fireEvent.press(getByTestId('add-suggestions-button'));

      expect(addMutate).toHaveBeenCalledWith(
        ['Suggested one?', 'Suggested three?'],
        expect.any(Object),
      );
    });

    it('will not add when nothing is selected', async () => {
      givenGeneratedQuestions();
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('generate-questions-button'));
      await fireEvent.press(getByTestId('generate-submit-button'));

      for (const index of [0, 1, 2]) await fireEvent.press(getByTestId(`suggestion-${index}`));
      await fireEvent.press(getByTestId('add-suggestions-button'));

      expect(addMutate).not.toHaveBeenCalled();
    });

    it.each([
      [
        { usedJobDescription: false, usedBriefing: false },
        /no job description or company briefing/i,
      ],
      [{ usedJobDescription: true, usedBriefing: false }, /no company briefing yet/i],
      [{ usedJobDescription: false, usedBriefing: true }, /no job description yet/i],
    ])('says so when the AI had little to work from (%j)', async (used, note) => {
      givenGeneratedQuestions({ ...GENERATED, ...used });
      const { getByTestId, getByText } = await renderScreen();
      await fireEvent.press(getByTestId('generate-questions-button'));

      await fireEvent.press(getByTestId('generate-submit-button'));

      expect(getByText(note)).toBeTruthy();
    });

    it('shows the API’s message when generating fails', async () => {
      mockedUseGenerateQuestions.mockReturnValue({
        mutate: generateQuestionsMutate,
        isPending: false,
        isError: true,
        error: {
          response: {
            errors: [
              {
                message: 'Add your AI API key in Settings to use this feature',
                extensions: { code: 'AI_NOT_CONFIGURED' },
              },
            ],
          },
        },
        reset: jest.fn(),
      } as never);
      const { getByTestId, getByText } = await renderScreen();

      await fireEvent.press(getByTestId('generate-questions-button'));

      expect(getByText(/Add your AI API key/)).toBeTruthy();
    });

    it('will not add more suggestions than there are free slots', async () => {
      givenQuestions(QUESTIONS, makeRound({ mockQuestionCount: 28 }));
      givenGeneratedQuestions();
      const { getByTestId, getByText } = await renderScreen();
      await fireEvent.press(getByTestId('generate-questions-button'));
      await fireEvent.press(getByTestId('generate-submit-button'));

      expect(getByText(/maximum of 30 practice questions/i)).toBeTruthy();
      await fireEvent.press(getByTestId('add-suggestions-button'));
      expect(addMutate).not.toHaveBeenCalled();

      await fireEvent.press(getByTestId('suggestion-2'));
      await fireEvent.press(getByTestId('add-suggestions-button'));
      expect(addMutate).toHaveBeenCalledTimes(1);
    });

    it('alerts instead of opening the generator or the form once the round is full', async () => {
      givenQuestions(QUESTIONS, makeRound({ mockQuestionCount: 30 }));
      const { getByTestId, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('generate-questions-button'));
      await fireEvent.press(getByTestId('add-practice-button'));

      expect(Alert.alert).toHaveBeenCalledTimes(2);
      expect(queryByTestId('generate-prompt-input')).toBeNull();
      expect(queryByTestId('practice-question-input')).toBeNull();
    });
  });

  describe('generating an answer', () => {
    it('shows the draft for review, labelled as AI generated, and saves nothing yet', async () => {
      givenGeneratedAnswer({
        answer: 'A drafted answer.',
        usedJobDescription: true,
        usedBriefing: true,
      });
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('generate-answer-q3'));

      expect(generateAnswerMutate).toHaveBeenCalledWith('q3', expect.any(Object));
      expect(getByTestId('answer-draft-input').props.value).toBe('A drafted answer.');
      expect(getByTestId('answer-draft-badge')).toBeTruthy();
      expect(updateMutate).not.toHaveBeenCalled();
    });

    it('saves the draft, as the user left it, marked as AI generated', async () => {
      givenGeneratedAnswer({
        answer: 'A drafted answer.',
        usedJobDescription: true,
        usedBriefing: true,
      });
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('generate-answer-q3'));

      await fireEvent.changeText(getByTestId('answer-draft-input'), 'A drafted answer, tightened.');
      await fireEvent.press(getByTestId('answer-draft-save-button'));

      expect(updateMutate).toHaveBeenCalledWith(
        {
          id: 'q3',
          data: { question: 'Third question', answer: 'A drafted answer, tightened.' },
          answerSource: 'ai',
        },
        expect.any(Object),
      );
    });

    it('discarding the draft saves nothing and closes it', async () => {
      givenGeneratedAnswer({
        answer: 'A drafted answer.',
        usedJobDescription: true,
        usedBriefing: true,
      });
      const { getByTestId, queryByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('generate-answer-q3'));

      await fireEvent.press(getByTestId('answer-draft-discard-button'));

      expect(queryByTestId('answer-draft-input')).toBeNull();
      expect(updateMutate).not.toHaveBeenCalled();
    });

    it('regenerating replaces the draft text', async () => {
      givenGeneratedAnswer({
        answer: 'First attempt.',
        usedJobDescription: true,
        usedBriefing: true,
      });
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('generate-answer-q3'));
      givenGeneratedAnswer({
        answer: 'Second attempt.',
        usedJobDescription: true,
        usedBriefing: true,
      });

      await fireEvent.press(getByTestId('answer-draft-regenerate-button'));

      await waitFor(() =>
        expect(getByTestId('answer-draft-input').props.value).toBe('Second attempt.'),
      );
    });

    it('alerts with the API’s message when the draft cannot be generated', async () => {
      generateAnswerMutate.mockImplementation(
        (_id: string, options?: { onError?: (e: unknown) => void }) =>
          options?.onError?.({
            response: {
              errors: [
                {
                  message: 'Too many requests — please wait a moment and try again',
                  extensions: { code: 'RATE_LIMITED' },
                },
              ],
            },
          }),
      );
      const { getByTestId, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('generate-answer-q3'));

      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not generate',
        'Too many requests — please wait a moment and try again',
      );
      expect(queryByTestId('answer-draft-input')).toBeNull();
    });
  });

  describe('reordering', () => {
    it('moves a question down and cannot move the last one further', async () => {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('move-practice-down-q1'));

      expect(reorderMutate).toHaveBeenCalledWith(['q2', 'q1', 'q3'], expect.any(Object));
      expect(getByTestId('move-practice-down-q3').props.accessibilityState?.disabled).toBeTruthy();
    });
  });
});
