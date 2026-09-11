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

  it('renders inline code constrained to the body line box', async () => {
    const { getByText } = await render(<AssistantMarkdown content="Status is `pending`" />);
    const node = getByText('pending');
    expect(node).toBeTruthy();
    const flatStyle = Object.assign({}, ...[node.props.style].flat());
    expect(flatStyle.fontSize).toBeLessThan(15);
    expect(flatStyle.lineHeight).toBe(20);
  });

  it('renders a fenced code block', async () => {
    const { getByText } = await render(<AssistantMarkdown content={'```\nconst x = 1;\n```'} />);
    expect(getByText('const x = 1;')).toBeTruthy();
  });
});
