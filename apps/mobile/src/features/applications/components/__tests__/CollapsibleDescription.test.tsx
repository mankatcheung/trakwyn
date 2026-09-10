import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';
import { CollapsibleDescription } from '../CollapsibleDescription';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseTheme = jest.mocked(useTheme);

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

async function fireMeasuredLayout(element: Parameters<typeof fireEvent>[0], lineCount: number) {
  const lines = Array.from({ length: lineCount }, (_, index) => ({
    text: `line ${index}`,
    x: 0,
    y: index * 21,
    width: 300,
    height: 21,
  }));
  await fireEvent(element, 'textLayout', { nativeEvent: { lines } });
}

describe('CollapsibleDescription', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('shows the full text with no toggle when it fits within the preview', async () => {
    const { getAllByText, queryByText, getByTestId } = await render(
      <CollapsibleDescription text="Short text." />,
    );

    await fireMeasuredLayout(getByTestId('description-measure'), 2);

    expect(getAllByText('Short text.').length).toBeGreaterThan(0);
    expect(queryByText('Show more')).toBeNull();
  });

  it('shows a toggle and clamps to 5 lines when the text is long', async () => {
    const { getAllByText, getByText, getByTestId } = await render(
      <CollapsibleDescription text="A long description spanning many lines." />,
    );

    await fireMeasuredLayout(getByTestId('description-measure'), 8);

    const visibleText = getAllByText('A long description spanning many lines.')[1];
    expect(visibleText.props.numberOfLines).toBe(5);
    expect(getByText('Show more')).toBeTruthy();
  });

  it('expands and collapses when the toggle is pressed', async () => {
    const { getByText, getAllByText, getByTestId } = await render(
      <CollapsibleDescription text="A long description spanning many lines." />,
    );

    await fireMeasuredLayout(getByTestId('description-measure'), 8);

    await fireEvent.press(getByText('Show more'));

    expect(getByText('Show less')).toBeTruthy();
    const expandedText = getAllByText('A long description spanning many lines.')[1];
    expect(expandedText.props.numberOfLines).toBeUndefined();

    await fireEvent.press(getByText('Show less'));

    expect(getByText('Show more')).toBeTruthy();
    const collapsedText = getAllByText('A long description spanning many lines.')[1];
    expect(collapsedText.props.numberOfLines).toBe(5);
  });
});
