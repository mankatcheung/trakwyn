import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FloatingActionButton } from '../FloatingActionButton';
import { useTheme } from '../../theme/ThemeContext';
import { lightColors } from '../../theme/colors';

jest.mock('../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

const mockedUseTheme = jest.mocked(useTheme);

describe('FloatingActionButton', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();

    const { getByTestId } = await render(<FloatingActionButton onPress={onPress} testID="fab" />);

    fireEvent.press(getByTestId('fab'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the provided accessibility label', async () => {
    const { getByLabelText } = await render(
      <FloatingActionButton onPress={jest.fn()} accessibilityLabel="Add" />,
    );

    expect(getByLabelText('Add')).toBeTruthy();
  });
});
