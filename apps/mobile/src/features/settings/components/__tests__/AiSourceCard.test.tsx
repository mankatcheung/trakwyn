import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import '../../../../i18n';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../../../lib/analytics', () => ({
  ...jest.requireActual('../../../../lib/analytics'),
  captureEvent: jest.fn(),
}));
import { useRouter } from 'expo-router';
import { useTheme } from '../../../../theme/ThemeContext';
import { lightColors } from '../../../../theme/colors';
import { captureEvent } from '../../../../lib/analytics';
import { AiSourceCard } from '../AiSourceCard';
import { AiCreditsExhaustedNotice } from '../AiCreditsExhaustedNotice';

const credits = (used: number) => ({
  used,
  limit: 30,
  bonusRemaining: 0,
  resetsAt: '2026-12-01T00:00:00.000Z',
});

function card(used: number, onChange = jest.fn()) {
  return (
    <AiSourceCard
      aiSource="auto"
      aiCredits={credits(used)}
      pending={false}
      error={null}
      onChange={onChange}
    />
  );
}

describe('AI source card and credits', () => {
  const push = jest.fn();
  beforeEach(() => {
    jest.mocked(useTheme).mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.mocked(useRouter).mockReturnValue({ push } as never);
    jest.mocked(captureEvent).mockClear();
    push.mockClear();
  });

  it('shows the remaining credits as a number and switches source', async () => {
    const onChange = jest.fn();
    const { getByTestId, getByText, queryByTestId } = await render(card(18, onChange));
    expect(getByText('12 of 30 left')).toBeTruthy();
    expect(queryByTestId('ai-credits-nearing')).toBeNull();
    expect(queryByTestId('ai-credits-exhausted-notice')).toBeNull();

    await fireEvent.press(getByTestId('ai-source-option-trakwyn'));
    expect(onChange).toHaveBeenCalledWith('trakwyn');
    await fireEvent.press(getByTestId('ai-source-option-auto'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('warns at 80%', async () => {
    const { getByTestId } = await render(card(25));
    expect(getByTestId('ai-credits-nearing')).toBeTruthy();
  });

  it('at 100% offers Upgrade and Add your own key, and reports each', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByTestId } = await render(card(30));
    expect(captureEvent).toHaveBeenCalledWith('ai_credits_exhausted_shown', {
      surface: 'settings',
      reason: 'credits',
    });

    await fireEvent.press(getByTestId('ai-upgrade-button'));
    expect(captureEvent).toHaveBeenCalledWith('ai_upgrade_clicked', { surface: 'settings' });
    expect(open).toHaveBeenCalledWith(expect.stringContaining('/settings/plan'));

    await fireEvent.press(getByTestId('ai-add-key-button'));
    expect(captureEvent).toHaveBeenCalledWith('ai_add_key_clicked', { surface: 'settings' });
    expect(push).toHaveBeenCalledWith('/settings/ai');
  });

  it('the notice falls back to generic copy without an API message', async () => {
    const { getByText } = await render(<AiCreditsExhaustedNotice surface="assistant" />);
    expect(getByText("You've used this month's AI credits.")).toBeTruthy();
  });
});
