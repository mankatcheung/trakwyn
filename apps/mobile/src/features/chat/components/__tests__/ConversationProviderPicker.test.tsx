import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { ConversationProviderPicker } from '../ConversationProviderPicker';
import type { LlmApiKey } from '../../../settings/types';

const mockedUseTheme = jest.mocked(useTheme);

const keys: LlmApiKey[] = [
  { provider: 'openai', model: 'gpt-4o-mini', baseUrl: null, monthlyTokenLimit: null },
  { provider: 'anthropic', model: null, baseUrl: null, monthlyTokenLimit: null },
];

describe('ConversationProviderPicker', () => {
  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
  });

  it('lists every saved key and marks the default provider', async () => {
    const { getByTestId, getByText } = await render(
      <ConversationProviderPicker
        keys={keys}
        defaultProvider="openai"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(getByTestId('conversation-provider-option-openai')).toBeTruthy();
    expect(getByTestId('conversation-provider-option-anthropic')).toBeTruthy();
    expect(getByText('gpt-4o-mini')).toBeTruthy();
  });

  it('calls onSelect with the chosen key', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      <ConversationProviderPicker
        keys={keys}
        defaultProvider="openai"
        onSelect={onSelect}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId('conversation-provider-option-anthropic'));

    expect(onSelect).toHaveBeenCalledWith(keys[1]);
  });

  it('calls onClose when the backdrop or cancel row is pressed', async () => {
    const onClose = jest.fn();
    const { getByTestId } = await render(
      <ConversationProviderPicker
        keys={keys}
        defaultProvider="openai"
        onSelect={jest.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.press(getByTestId('conversation-provider-picker-cancel'));

    expect(onClose).toHaveBeenCalled();
  });
});
