import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { DraftFormattingToolbar } from '../DraftFormattingToolbar';

const IDS: [string, string][] = [
  ['toolbar-bold', 'Bold'],
  ['toolbar-italic', 'Italic'],
  ['toolbar-strike', 'Strikethrough'],
  ['toolbar-h1', 'Heading 1'],
  ['toolbar-h2', 'Heading 2'],
  ['toolbar-h3', 'Heading 3'],
  ['toolbar-bullet-list', 'Bulleted list'],
  ['toolbar-ordered-list', 'Numbered list'],
  ['toolbar-quote', 'Quote'],
  ['toolbar-link', 'Insert link'],
];

async function renderToolbar(
  over: Partial<{
    text: string;
    selection: { start: number; end: number };
    disabled: boolean;
  }> = {},
) {
  const onEdit = jest.fn();
  const utils = await render(
    <DraftFormattingToolbar
      text={over.text ?? 'Hello world'}
      selection={over.selection ?? { start: 6, end: 11 }}
      onEdit={onEdit}
      disabled={over.disabled}
    />,
  );
  return { ...utils, onEdit };
}

describe('DraftFormattingToolbar', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({ colors: lightColors } as never);
  });

  it.each(IDS)('%s is a button with the label %s', async (testID, label) => {
    const { getByTestId } = await renderToolbar();
    const button = getByTestId(testID);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(label);
  });

  it('wraps the selection in strike markers and prefixes a quote', async () => {
    const { getByTestId, onEdit } = await renderToolbar();
    await fireEvent.press(getByTestId('toolbar-strike'));
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Hello ~~world~~' }));
    await fireEvent.press(getByTestId('toolbar-quote'));
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ text: '> Hello world' }));
  });

  it('reports itself disabled to assistive technology', async () => {
    const { getByTestId, onEdit } = await renderToolbar({ disabled: true });
    expect(getByTestId('toolbar-bold').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(getByTestId('toolbar-bold'));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('asks for a URL and links the selection that was chosen when it opened', async () => {
    const { getByTestId, queryByTestId, onEdit } = await renderToolbar();
    expect(queryByTestId('toolbar-link-row')).toBeNull();
    await fireEvent.press(getByTestId('toolbar-link'));
    await fireEvent.changeText(getByTestId('toolbar-link-input'), 'example.com');
    await fireEvent.press(getByTestId('toolbar-link-insert'));

    expect(onEdit).toHaveBeenCalledWith({
      text: 'Hello [world](https://example.com)',
      selection: { start: 34, end: 34 },
    });
    expect(queryByTestId('toolbar-link-row')).toBeNull();
  });

  it('refuses an unsafe address and keeps the row open', async () => {
    const { getByTestId, onEdit } = await renderToolbar();
    await fireEvent.press(getByTestId('toolbar-link'));
    await fireEvent.changeText(getByTestId('toolbar-link-input'), 'javascript:alert(1)');
    await fireEvent.press(getByTestId('toolbar-link-insert'));

    expect(onEdit).not.toHaveBeenCalled();
    expect(getByTestId('toolbar-link-invalid')).toBeTruthy();
    await fireEvent.press(getByTestId('toolbar-link-cancel'));
    expect(() => getByTestId('toolbar-link-row')).toThrow();
  });
});
