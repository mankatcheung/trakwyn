import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';
import { TimezonePicker } from '../TimezonePicker';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseTheme = jest.mocked(useTheme);

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

describe('TimezonePicker', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('opens the modal on press and closes it via Done', async () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <TimezonePicker value="" onChange={onChange} testID="tz-field" />,
    );

    expect(queryByTestId('timezone-search-input')).toBeNull();

    await fireEvent.press(getByTestId('tz-field'));
    expect(getByTestId('timezone-search-input')).toBeTruthy();

    await fireEvent.press(getByTestId('timezone-picker-done'));
    expect(queryByTestId('timezone-search-input')).toBeNull();
  });

  it('filters zones by search query and selects one', async () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <TimezonePicker value="" onChange={onChange} testID="tz-field" />,
    );

    await fireEvent.press(getByTestId('tz-field'));
    await fireEvent.changeText(getByTestId('timezone-search-input'), 'Tokyo');

    const option = getByTestId('timezone-option-Asia/Tokyo');
    expect(option).toBeTruthy();

    await fireEvent.press(option);
    expect(onChange).toHaveBeenCalledWith('Asia/Tokyo');
    expect(queryByTestId('timezone-search-input')).toBeNull();
  });
});
