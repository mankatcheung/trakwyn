import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';
import { StatusFilterButton } from '../StatusFilterButton';
import { statusDotColor } from '../../lib/statusColors';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';

const mockedUseTheme = jest.mocked(useTheme);

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat());
}

describe('StatusFilterButton', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('shows no dot on the trigger when "all" is selected', async () => {
    const { queryByTestId } = await render(<StatusFilterButton value="all" onChange={jest.fn()} />);

    expect(queryByTestId(/status-filter-dot-/)).toBeNull();
  });

  it("shows the selected status's dot on the trigger, colored to match", async () => {
    const { getByTestId } = await render(
      <StatusFilterButton value="interviewing" onChange={jest.fn()} />,
    );

    const dot = getByTestId('status-filter-dot-interviewing');
    expect(flattenStyle(dot.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: statusDotColor('interviewing', lightColors) }),
    );
  });

  it('shows a dot next to each status option in the picker sheet, but not for "All"', async () => {
    const { getByTestId, queryByTestId } = await render(
      <StatusFilterButton value="all" onChange={jest.fn()} />,
    );

    await fireEvent.press(getByTestId('applications-status-filter-button'));

    expect(queryByTestId('status-filter-option-all-dot')).toBeNull();

    const appliedDot = getByTestId('status-filter-dot-applied');
    expect(flattenStyle(appliedDot.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: statusDotColor('applied', lightColors) }),
    );
  });

  it('calls onChange with the picked status', async () => {
    const onChange = jest.fn();
    const { getByTestId } = await render(<StatusFilterButton value="all" onChange={onChange} />);

    await fireEvent.press(getByTestId('applications-status-filter-button'));
    await fireEvent.press(getByTestId('status-filter-option-offered'));

    expect(onChange).toHaveBeenCalledWith('offered');
  });
});
