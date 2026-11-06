import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../ai/hooks/useAiCredits', () => ({ useAiCredits: jest.fn() }));
jest.mock('../ResumeSourcePicker', () => {
  const { Pressable } = require('react-native');
  return {
    ResumeSourcePicker: ({ onChange }: { onChange: (c: unknown) => void }) => (
      <Pressable testID="picker-mock" onPress={() => onChange({ kind: 'file', id: 'f1' })} />
    ),
  };
});

import { useRouter } from 'expo-router';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { useAiCredits } from '../../../ai/hooks/useAiCredits';
import { AiHelperSheet } from '../AiHelperSheet';

const push = jest.fn();
const costs: Record<string, number> = { resume: 5, coverLetter: 3, polishDraft: 2 };

function credits(over: Record<string, unknown> = {}) {
  jest.mocked(useAiCredits).mockReturnValue({
    onTrakwynAi: true,
    needsSetup: false,
    standing: { left: 12, total: 30 },
    costOf: (f: string) => costs[f] ?? null,
    canAfford: () => true,
    refresh: jest.fn(),
    ...over,
  } as never);
}

const handlers = () => ({
  onClose: jest.fn(),
  onInstructionsChange: jest.fn(),
  onGenerate: jest.fn(),
  onPolish: jest.fn(),
  onReplace: jest.fn(),
  onInsertBelow: jest.fn(),
  onDiscard: jest.fn(),
});

async function renderSheet(over: Record<string, unknown> = {}, h = handlers()) {
  const utils = await render(
    <AiHelperSheet
      visible
      applicationId="app-1"
      type="cover_letter"
      hasText={false}
      instructions=""
      running={false}
      failure={null}
      suggestion={null}
      currentText=""
      {...h}
      {...(over as object)}
    />,
  );
  return { ...utils, h };
}

describe('AiHelperSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useRouter).mockReturnValue({ push } as never);
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    credits();
  });

  it('offers Generate on an empty editor, with the cost and credits left', async () => {
    const { getByTestId, getByText, h } = await renderSheet();
    expect(getByText('Generate')).toBeTruthy();
    expect(getByTestId('ai-helper-cost').props.children).toBe('Uses 3 credits');
    expect(getByTestId('ai-helper-credits-left')).toBeTruthy();
    await fireEvent.press(getByTestId('ai-helper-run'));
    expect(h.onGenerate).toHaveBeenCalledWith(null);
  });

  it('passes the chosen source resume to Generate for a cover letter', async () => {
    const { getByTestId, h } = await renderSheet();
    await fireEvent.press(getByTestId('picker-mock'));
    await fireEvent.press(getByTestId('ai-helper-run'));
    expect(h.onGenerate).toHaveBeenCalledWith({ kind: 'file', id: 'f1' });
  });

  it('has no source picker for a resume', async () => {
    const { queryByTestId } = await renderSheet({ type: 'resume' });
    expect(queryByTestId('picker-mock')).toBeNull();
  });

  it('has no source picker once there is text', async () => {
    const { queryByTestId } = await renderSheet({ hasText: true });
    expect(queryByTestId('picker-mock')).toBeNull();
  });

  it('offers Polish when the editor has text', async () => {
    const { getByTestId, getByText, h } = await renderSheet({ hasText: true });
    expect(getByText('Polish')).toBeTruthy();
    expect(getByTestId('ai-helper-cost').props.children).toBe('Uses 2 credits');
    await fireEvent.press(getByTestId('ai-helper-run'));
    expect(h.onPolish).toHaveBeenCalled();
  });

  it('counts the prompt and caps it at 500 characters', async () => {
    const { getByTestId, h } = await renderSheet({ instructions: 'abc' });
    expect(getByTestId('ai-helper-counter').props.children.join('')).toBe('3/500');
    await fireEvent.changeText(getByTestId('ai-helper-prompt'), 'x'.repeat(600));
    expect(h.onInstructionsChange).toHaveBeenCalledWith('x'.repeat(500));
  });

  it('shows no credit line for a user on their own key', async () => {
    credits({ onTrakwynAi: false });
    const { queryByTestId } = await renderSheet();
    expect(queryByTestId('ai-helper-cost')).toBeNull();
    expect(queryByTestId('ai-helper-credits-left')).toBeNull();
  });

  it('disables the action when credits are spent and links to Settings → AI', async () => {
    credits({ canAfford: () => false });
    const { getByTestId, h } = await renderSheet();
    expect(getByTestId('ai-helper-run').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(getByTestId('ai-helper-run'));
    expect(h.onGenerate).not.toHaveBeenCalled();

    await fireEvent.press(getByTestId('ai-helper-exhausted-link'));
    expect(h.onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/settings/ai');
  });

  it('points to AI setup when nothing can answer', async () => {
    credits({ onTrakwynAi: false, needsSetup: true });
    const { getByTestId, queryByTestId } = await renderSheet();
    expect(queryByTestId('ai-helper-run')).toBeNull();
    await fireEvent.press(getByTestId('ai-helper-setup'));
    expect(push).toHaveBeenCalledWith('/settings/ai');
  });

  it('asks before regenerating from scratch', async () => {
    const { getByTestId, queryByTestId, h } = await renderSheet({ hasText: true });
    await fireEvent.press(getByTestId('ai-helper-regenerate'));
    expect(h.onGenerate).not.toHaveBeenCalled();
    await fireEvent.press(getByTestId('ai-helper-regenerate-cancel'));
    expect(queryByTestId('ai-helper-regenerate-confirm')).toBeNull();

    await fireEvent.press(getByTestId('ai-helper-regenerate'));
    await fireEvent.press(getByTestId('ai-helper-regenerate-yes'));
    expect(h.onGenerate).toHaveBeenCalledWith(null);
  });

  it('shows a failure message', async () => {
    const { getByTestId } = await renderSheet({ failure: 'Rate limited' });
    expect(getByTestId('ai-helper-error').props.children).toBe('Rate limited');
  });

  const suggestion = { markdown: 'Better text', sourceText: 'orig' };

  it('lets the user replace or insert a suggestion made for the current text', async () => {
    const { getByTestId, h } = await renderSheet({
      hasText: true,
      suggestion,
      currentText: 'orig',
    });
    await fireEvent.press(getByTestId('polish-replace'));
    expect(h.onReplace).toHaveBeenCalled();
    await fireEvent.press(getByTestId('polish-insert'));
    expect(h.onInsertBelow).toHaveBeenCalled();
  });

  it('only offers Insert below once the text moved on, and Discard drops it', async () => {
    const { getByTestId, queryByTestId, h } = await renderSheet({
      hasText: true,
      suggestion,
      currentText: 'orig + edits',
    });
    expect(queryByTestId('polish-replace')).toBeNull();
    expect(getByTestId('polish-preview-stale')).toBeTruthy();
    await fireEvent.press(getByTestId('polish-discard'));
    expect(h.onDiscard).toHaveBeenCalled();
  });
});
