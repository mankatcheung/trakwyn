import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useAiCredits } from '../../hooks/useAiCredits';
import { exhaustedCredits, ownKeyCredits, trakwynCredits } from '../../testing/aiCreditsFixture';
import { AiActionBar } from '../AiActionBar';

async function renderBar(props: Partial<React.ComponentProps<typeof AiActionBar>> = {}) {
  const onRun = jest.fn();
  const utils = await render(
    <AiActionBar feature="mockAnswer" label="Generate" onRun={onRun} {...props} />,
  );
  return { onRun, ...utils };
}

describe('AiActionBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.mocked(useAiCredits).mockReturnValue(ownKeyCredits());
  });

  it('runs the action on press', async () => {
    const { onRun, getByTestId } = await renderBar();
    await fireEvent.press(getByTestId('ai-run-button'));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('shows the cost and credits left for a Trakwyn AI user', async () => {
    jest.mocked(useAiCredits).mockReturnValue(trakwynCredits());
    const { getByText } = await renderBar();
    expect(getByText('Uses 2 credits')).toBeTruthy();
    expect(getByText(/12 of 30 left · resets/)).toBeTruthy();
  });

  it('says "credit" for a cost of one', async () => {
    jest.mocked(useAiCredits).mockReturnValue(trakwynCredits());
    const { getByText } = await renderBar({ feature: 'mockQuestions' });
    expect(getByText('Uses 1 credit')).toBeTruthy();
  });

  it('shows no credit line for a user on their own key', async () => {
    const { queryByText, queryByTestId } = await renderBar();
    expect(queryByText(/Uses \d+ credit/)).toBeNull();
    expect(queryByTestId('ai-credits-inline')).toBeNull();
  });

  it('shows no cost while the API has not said what it is', async () => {
    jest.mocked(useAiCredits).mockReturnValue(trakwynCredits({ costOf: () => null }));
    const { queryByText } = await renderBar();
    expect(queryByText(/Uses \d+ credit/)).toBeNull();
  });

  it('disables the action and explains why once the credits are spent', async () => {
    jest.mocked(useAiCredits).mockReturnValue(exhaustedCredits());
    const { onRun, getByTestId, getByText, queryByText } = await renderBar();

    await fireEvent.press(getByTestId('ai-run-button'));

    expect(onRun).not.toHaveBeenCalled();
    expect(getByText('You are out of AI credits this month.')).toBeTruthy();
    expect(getByTestId('ai-add-key-button')).toBeTruthy();
    expect(queryByText(/Uses \d+ credit/)).toBeNull();
  });

  it('sends the user to Settings → AI to add a key when the credits are spent', async () => {
    jest.mocked(useAiCredits).mockReturnValue(exhaustedCredits());
    const { getByTestId } = await renderBar();
    await fireEvent.press(getByTestId('ai-add-key-button'));
    expect(mockPush).toHaveBeenCalledWith('/settings/ai');
  });

  it('offers Set up AI instead of the action when nothing can answer', async () => {
    jest.mocked(useAiCredits).mockReturnValue(ownKeyCredits({ needsSetup: true }));
    const { getByTestId, queryByTestId } = await renderBar();

    expect(queryByTestId('ai-run-button')).toBeNull();
    await fireEvent.press(getByTestId('ai-setup-button'));
    expect(mockPush).toHaveBeenCalledWith('/settings/ai');
  });

  it('does not run while loading or disabled', async () => {
    const loading = await renderBar({ loading: true });
    await fireEvent.press(loading.getByTestId('ai-run-button'));
    expect(loading.onRun).not.toHaveBeenCalled();
  });

  it('does not run while disabled', async () => {
    const { onRun, getByTestId } = await renderBar({ disabled: true });
    await fireEvent.press(getByTestId('ai-run-button'));
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows an open prompt with a counter, and passes edits up', async () => {
    const onChange = jest.fn();
    const { getByTestId } = await renderBar({
      instructions: { value: 'abc', onChange, inputTestID: 'prompt' },
    });

    expect(getByTestId('prompt').props.value).toBe('abc');
    expect(getByTestId('prompt-counter').props.children.join('')).toBe('3/500');
    await fireEvent.changeText(getByTestId('prompt'), 'abcd');
    expect(onChange).toHaveBeenCalledWith('abcd');
  });

  it('keeps a collapsible prompt behind an "Add instructions" toggle', async () => {
    const { getByTestId, queryByTestId, getByText } = await renderBar({
      instructions: {
        value: '',
        onChange: jest.fn(),
        collapsible: true,
        inputTestID: 'prompt',
        toggleTestID: 'toggle',
      },
    });

    expect(queryByTestId('prompt')).toBeNull();
    await fireEvent.press(getByTestId('toggle'));
    expect(getByTestId('prompt')).toBeTruthy();
    expect(getByText('Hide instructions')).toBeTruthy();
    await fireEvent.press(getByTestId('toggle'));
    expect(queryByTestId('prompt')).toBeNull();
  });

  it('renders no prompt for an action that takes none', async () => {
    const { queryByTestId } = await renderBar();
    expect(queryByTestId('ai-prompt-input')).toBeNull();
    expect(queryByTestId('ai-instructions-toggle')).toBeNull();
  });

  it('renders children between the prompt and the button', async () => {
    const { getByText } = await renderBar({ children: <Text>background chooser</Text> });
    expect(getByText('background chooser')).toBeTruthy();
  });
});
