import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { DraftStatusBar } from '../DraftStatusBar';

async function renderBar(over: Record<string, unknown> = {}) {
  const onRetry = jest.fn();
  const utils = await render(
    <DraftStatusBar
      text="# Hi\n\n**there** you"
      selection={{ start: 0, end: 0 }}
      saving={false}
      failed={false}
      hasSaved
      onRetry={onRetry}
      {...over}
    />,
  );
  return { ...utils, onRetry };
}

describe('DraftStatusBar', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
  });

  it('counts words and characters of the draft without Markdown markers', async () => {
    const { getByTestId } = await renderBar({ text: '# Hi\n\n**there** you' });
    expect(getByTestId('draft-count').props.children).toBe('3 words · 13 characters');
  });

  it('uses the singular', async () => {
    const { getByTestId } = await renderBar({ text: 'a' });
    expect(getByTestId('draft-count').props.children).toBe('1 word · 1 character');
  });

  it('counts only the selection while text is selected', async () => {
    const { getByTestId } = await renderBar({
      text: 'one two three four',
      selection: { start: 4, end: 13 },
    });
    expect(getByTestId('draft-count').props.children).toBe('Selected: 2 words · 9 characters');
  });

  it('shows Saving…', async () => {
    const { getByTestId } = await renderBar({ saving: true });
    expect(getByTestId('draft-status-saving')).toBeTruthy();
  });

  it('shows Saved', async () => {
    const { getByTestId } = await renderBar();
    expect(getByTestId('draft-status-saved')).toBeTruthy();
  });

  it("shows Couldn't save with a Retry that resends", async () => {
    const { getByTestId, onRetry } = await renderBar({ failed: true });
    expect(getByTestId('draft-status-failed')).toBeTruthy();
    await fireEvent.press(getByTestId('draft-save-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows no save status before anything has been saved', async () => {
    const { queryByTestId } = await renderBar({ hasSaved: false });
    expect(queryByTestId('draft-status-saved')).toBeNull();
    expect(queryByTestId('draft-status-saving')).toBeNull();
  });
});
