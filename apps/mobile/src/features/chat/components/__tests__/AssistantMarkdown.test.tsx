import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { AssistantMarkdown } from '../AssistantMarkdown';

const mockedUseTheme = jest.mocked(useTheme);

describe('AssistantMarkdown', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('renders bold text from markdown', async () => {
    const { getByText } = await render(<AssistantMarkdown content="**bold**" />);
    expect(getByText('bold')).toBeTruthy();
  });

  it('renders a bullet list', async () => {
    const { getByText } = await render(<AssistantMarkdown content={'- one\n- two'} />);
    expect(getByText('one')).toBeTruthy();
    expect(getByText('two')).toBeTruthy();
  });

  it('renders plain paragraph text', async () => {
    const { getByText } = await render(<AssistantMarkdown content="Hello there" />);
    expect(getByText('Hello there')).toBeTruthy();
  });
});
