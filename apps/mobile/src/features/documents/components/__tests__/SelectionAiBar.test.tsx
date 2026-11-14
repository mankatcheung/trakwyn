import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));

import { useRouter } from 'expo-router';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import type { SelectionAiState } from '../../hooks/useSelectionAi';
import { SelectionAiBar } from '../SelectionAiBar';

const push = jest.fn();
const range = { start: 0, end: 4, text: 'weak' };

function credits(over: Record<string, unknown> = {}) {
  jest.mocked(useAiCredits).mockReturnValue({
    onTrakwynAi: true,
    needsSetup: false,
    standing: { left: 12, total: 30 },
    costOf: () => 2,
    canAfford: () => true,
    refresh: jest.fn(),
    ...over,
  } as never);
}

async function renderBar(state: SelectionAiState = { phase: 'idle' }, disabled = false) {
  const h = { onRun: jest.fn(), onAsk: jest.fn(), onAccept: jest.fn(), onDismiss: jest.fn() };
  const utils = await render(<SelectionAiBar state={state} disabled={disabled} {...h} />);
  return { ...utils, ...h };
}

describe('SelectionAiBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
    jest.mocked(useRouter).mockReturnValue({ push } as never);
    credits();
  });

  it('offers the four presets and Ask AI, and the cost line', async () => {
    const { getByTestId, getByText, onRun, onAsk } = await renderBar();
    await fireEvent.press(getByTestId('selection-ai-shorten'));
    expect(onRun).toHaveBeenCalledWith({ kind: 'preset', action: 'shorten' });
    getByText('Rewrite');
    getByText('Make more formal');
    getByText('Fix grammar');
    await fireEvent.press(getByTestId('selection-ai-ask-open'));
    expect(onAsk).toHaveBeenCalled();
    expect(getByTestId('selection-ai-cost')).toBeTruthy();
  });

  it('disables the actions when credits are exhausted and links to AI settings', async () => {
    credits({ canAfford: () => false });
    const { getByTestId, onRun, getByText } = await renderBar();
    await fireEvent.press(getByTestId('selection-ai-rewrite'));
    expect(onRun).not.toHaveBeenCalled();
    expect(getByTestId('selection-ai-exhausted')).toBeTruthy();
    await fireEvent.press(getByText('Add your own key or upgrade'));
    expect(push).toHaveBeenCalledWith('/settings/ai');
  });

  it('sends people without a provider to set one up', async () => {
    credits({ needsSetup: true });
    const { getByTestId, queryByTestId, getByText } = await renderBar();
    expect(getByTestId('selection-ai-setup')).toBeTruthy();
    expect(queryByTestId('selection-ai-rewrite')).toBeNull();
    await fireEvent.press(getByText('Set up AI'));
    expect(push).toHaveBeenCalledWith('/settings/ai');
  });

  it('is disabled while another AI request runs', async () => {
    const { getByTestId, onRun } = await renderBar({ phase: 'idle' }, true);
    await fireEvent.press(getByTestId('selection-ai-rewrite'));
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows a loading state', async () => {
    const { getByTestId } = await renderBar({ phase: 'loading', range });
    expect(getByTestId('selection-ai-loading')).toBeTruthy();
  });

  it('shows before and after with Accept and Reject', async () => {
    const { getByTestId, onAccept, onDismiss } = await renderBar({
      phase: 'proposal',
      range,
      markdown: 'strong',
    });
    expect(getByTestId('selection-ai-before').props.children).toBe('weak');
    await fireEvent.press(getByTestId('selection-ai-accept'));
    expect(onAccept).toHaveBeenCalled();
    await fireEvent.press(getByTestId('selection-ai-reject'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('sends a custom request from the ask field', async () => {
    const { getByTestId, onRun } = await renderBar({ phase: 'ask', range });
    await fireEvent.changeText(getByTestId('selection-ai-prompt'), 'make it punchy');
    await fireEvent.press(getByTestId('selection-ai-send'));
    expect(onRun).toHaveBeenCalledWith({ kind: 'custom', text: 'make it punchy' });
  });

  it('shows an error message, or the changed-text message', async () => {
    const first = await renderBar({
      phase: 'error',
      range,
      message: 'Rate limited',
      changed: false,
    });
    expect(first.getByText('Rate limited')).toBeTruthy();
    await fireEvent.press(first.getByTestId('selection-ai-dismiss'));
    expect(first.onDismiss).toHaveBeenCalled();
    first.unmount();
    const second = await renderBar({ phase: 'error', range, message: '', changed: true });
    expect(second.getByText(/selected text changed/)).toBeTruthy();
  });
});
