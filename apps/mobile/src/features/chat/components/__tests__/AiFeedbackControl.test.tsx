import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../../../i18n';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { gqlRequest } from '../../../../graphql/client';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { chatHistoryQueryKey } from '../../hooks/useChatHistory';
import { AiFeedbackControl } from '../AiFeedbackControl';
import type { AiRating, ChatMessage } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedUseTheme = jest.mocked(useTheme);

let queryClient: QueryClient;
function renderControl(rating: AiRating | null = null) {
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const history: ChatMessage[] = [
    { id: 'm2', role: 'assistant', content: 'hello', createdAt: '', myRating: rating },
  ];
  queryClient.setQueryData(chatHistoryQueryKey('c1'), history);
  return render(
    <QueryClientProvider client={queryClient}>
      <AiFeedbackControl messageId="m2" conversationId="c1" rating={rating} />
    </QueryClientProvider>,
  );
}

const ratingCalls = () =>
  mockedGqlRequest.mock.calls.filter(([query]) => String(query).includes('rateAiOutput'));
const cachedRating = () =>
  queryClient.getQueryData<ChatMessage[]>(chatHistoryQueryKey('c1'))?.[0].myRating;

describe('AiFeedbackControl (JEF-547)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGqlRequest.mockResolvedValue({} as never);
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('starts with neither thumb chosen', async () => {
    const { getByTestId } = await renderControl();

    expect(getByTestId('ai-feedback-up-m2').props.accessibilityState.selected).toBe(false);
    expect(getByTestId('ai-feedback-down-m2').props.accessibilityState.selected).toBe(false);
  });

  it('shows a stored rating, so it is there again after a reload', async () => {
    const { getByTestId } = await renderControl({ rating: 'DOWN', reason: 'NOT_USEFUL' });

    expect(getByTestId('ai-feedback-down-m2').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('ai-feedback-up-m2').props.accessibilityState.selected).toBe(false);
  });

  it('saves a thumbs up by id, and keeps it in the cached history', async () => {
    const { getByTestId } = await renderControl();

    await fireEvent.press(getByTestId('ai-feedback-up-m2'));

    await waitFor(() => expect(ratingCalls()).toHaveLength(1));
    expect(ratingCalls()[0][1]).toEqual({
      targetKind: 'CHAT_MESSAGE',
      targetId: 'm2',
      rating: 'UP',
      reason: null,
    });
    await waitFor(() => expect(cachedRating()).toEqual({ rating: 'UP', reason: null }));
    expect(getByTestId('ai-feedback-up-m2').props.accessibilityState.selected).toBe(true);
  });

  it('saves a thumbs down at once and then offers the fixed list of reasons', async () => {
    const { getByTestId, queryByTestId } = await renderControl();

    await fireEvent.press(getByTestId('ai-feedback-down-m2'));

    await waitFor(() => expect(ratingCalls()).toHaveLength(1));
    expect(ratingCalls()[0][1]).toMatchObject({ rating: 'DOWN', reason: null });
    expect(getByTestId('ai-feedback-reasons-m2')).toBeTruthy();
    for (const reason of [
      'WRONG_OR_MADE_UP',
      'IGNORED_MY_REQUEST',
      'UNSAFE_OR_INAPPROPRIATE',
      'NOT_USEFUL',
      'OTHER',
    ]) {
      expect(getByTestId(`ai-feedback-reason-${reason}-m2`)).toBeTruthy();
    }
    // Nothing free-text: no text field is offered.
    expect(queryByTestId('ai-feedback-text-m2')).toBeNull();
  });

  it('records the chosen reason on the down-vote and closes the picker', async () => {
    const { getByTestId, queryByTestId } = await renderControl();
    await fireEvent.press(getByTestId('ai-feedback-down-m2'));
    await waitFor(() => expect(ratingCalls()).toHaveLength(1));

    await fireEvent.press(getByTestId('ai-feedback-reason-WRONG_OR_MADE_UP-m2'));

    await waitFor(() => expect(ratingCalls()).toHaveLength(2));
    expect(ratingCalls()[1][1]).toMatchObject({ rating: 'DOWN', reason: 'WRONG_OR_MADE_UP' });
    await waitFor(() => expect(queryByTestId('ai-feedback-reasons-m2')).toBeNull());
    expect(cachedRating()).toEqual({ rating: 'DOWN', reason: 'WRONG_OR_MADE_UP' });
  });

  it('keeps the down-vote when the reason is skipped', async () => {
    const { getByTestId, queryByTestId } = await renderControl();
    await fireEvent.press(getByTestId('ai-feedback-down-m2'));
    await waitFor(() => expect(ratingCalls()).toHaveLength(1));

    await fireEvent.press(getByTestId('ai-feedback-skip-m2'));

    expect(queryByTestId('ai-feedback-reasons-m2')).toBeNull();
    expect(getByTestId('ai-feedback-down-m2').props.accessibilityState.selected).toBe(true);
    expect(ratingCalls()).toHaveLength(1);
  });

  it('takes the rating back when the chosen thumb is pressed again', async () => {
    const { getByTestId } = await renderControl({ rating: 'UP', reason: null });

    await fireEvent.press(getByTestId('ai-feedback-up-m2'));

    await waitFor(() =>
      expect(
        mockedGqlRequest.mock.calls.filter(([query]) =>
          String(query).includes('clearAiOutputRating'),
        ),
      ).toHaveLength(1),
    );
    expect(ratingCalls()).toHaveLength(0);
    await waitFor(() => expect(cachedRating()).toBeNull());
    expect(getByTestId('ai-feedback-up-m2').props.accessibilityState.selected).toBe(false);
  });

  it('puts the thumb back and says so when the API refuses', async () => {
    mockedGqlRequest.mockRejectedValue(new Error('network down'));
    const { getByTestId, findByText } = await renderControl();

    await fireEvent.press(getByTestId('ai-feedback-up-m2'));

    expect(await findByText(/couldn.t save your feedback/i)).toBeTruthy();
    expect(getByTestId('ai-feedback-up-m2').props.accessibilityState.selected).toBe(false);
    expect(cachedRating()).toBeNull();
  });
});
