import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import '../../i18n';

jest.mock('../AuthContext', () => ({ useAuth: jest.fn() }));

jest.mock('../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
import { useAuth } from '../AuthContext';
import { StepUpCancelledError, useStepUpReauth } from '../useStepUpReauth';
import { useTheme } from '../../theme/ThemeContext';
import { lightColors } from '../../theme/colors';

const mockedUseAuth = jest.mocked(useAuth);
const mockedUseTheme = jest.mocked(useTheme);

const stepUpRequired = () => ({
  response: {
    errors: [
      {
        message: 'Please verify your identity again to continue.',
        extensions: { code: 'STEP_UP_REQUIRED' },
      },
    ],
  },
});

function Harness({ action }: { action: () => Promise<string> }) {
  const { withStepUp, dialog } = useStepUpReauth();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <View>
      <Pressable
        testID="run"
        onPress={() => {
          withStepUp(action).then(setResult, (err: Error) => setError(err.name));
        }}
      >
        <Text>run</Text>
      </Pressable>
      {result ? <Text testID="result">{result}</Text> : null}
      {error ? <Text testID="error">{error}</Text> : null}
      {dialog}
    </View>
  );
}

describe('useStepUpReauth', () => {
  const reauthenticate = jest.fn();

  beforeEach(() => {
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ reauthenticate } as never);
  });

  it('passes an ordinary result straight through without prompting', async () => {
    const action = jest.fn().mockResolvedValue('done');
    const { getByTestId, queryByTestId } = await render(<Harness action={action} />);

    await fireEvent.press(getByTestId('run'));

    await waitFor(() => expect(getByTestId('result')).toHaveTextContent('done'));
    expect(queryByTestId('step-up-reauth')).toBeNull();
    expect(reauthenticate).not.toHaveBeenCalled();
  });

  it('rethrows errors that are not a step-up request', async () => {
    const action = jest.fn().mockRejectedValue(new Error('boom'));
    const { getByTestId, queryByTestId } = await render(<Harness action={action} />);

    await fireEvent.press(getByTestId('run'));

    await waitFor(() => expect(getByTestId('error')).toHaveTextContent('Error'));
    expect(queryByTestId('step-up-reauth')).toBeNull();
  });

  it('prompts for the password on STEP_UP_REQUIRED, reauthenticates, and retries the action', async () => {
    const action = jest.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce('done');
    reauthenticate.mockResolvedValueOnce({ totpRequired: false });
    const { getByTestId, queryByTestId } = await render(<Harness action={action} />);

    await fireEvent.press(getByTestId('run'));
    await waitFor(() => expect(getByTestId('step-up-reauth')).toBeTruthy());

    await fireEvent.changeText(getByTestId('step-up-password-input'), 'correct-horse');
    await fireEvent.press(getByTestId('step-up-confirm-button'));

    await waitFor(() => expect(getByTestId('result')).toHaveTextContent('done'));
    expect(reauthenticate).toHaveBeenCalledWith('correct-horse', undefined);
    expect(action).toHaveBeenCalledTimes(2);
    expect(queryByTestId('step-up-reauth')).toBeNull();
  });

  it('asks for a TOTP code when the password alone is not enough', async () => {
    const action = jest.fn().mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce('done');
    reauthenticate
      .mockResolvedValueOnce({ totpRequired: true })
      .mockResolvedValueOnce({ totpRequired: false });
    const { getByTestId, queryByTestId } = await render(<Harness action={action} />);

    await fireEvent.press(getByTestId('run'));
    await waitFor(() => expect(getByTestId('step-up-reauth')).toBeTruthy());
    expect(queryByTestId('step-up-code-input')).toBeNull();

    await fireEvent.changeText(getByTestId('step-up-password-input'), 'correct-horse');
    await fireEvent.press(getByTestId('step-up-confirm-button'));

    await waitFor(() => expect(getByTestId('step-up-code-input')).toBeTruthy());
    await fireEvent.changeText(getByTestId('step-up-code-input'), '123456');
    await fireEvent.press(getByTestId('step-up-confirm-button'));

    await waitFor(() => expect(getByTestId('result')).toHaveTextContent('done'));
    expect(reauthenticate).toHaveBeenLastCalledWith('correct-horse', '123456');
  });

  it('shows the reauthentication error and keeps the prompt open', async () => {
    const action = jest.fn().mockRejectedValueOnce(stepUpRequired());
    reauthenticate.mockRejectedValueOnce({
      response: { errors: [{ message: 'Invalid credentials' }] },
    });
    const { getByTestId, getByText } = await render(<Harness action={action} />);

    await fireEvent.press(getByTestId('run'));
    await waitFor(() => expect(getByTestId('step-up-reauth')).toBeTruthy());

    await fireEvent.changeText(getByTestId('step-up-password-input'), 'wrong');
    await fireEvent.press(getByTestId('step-up-confirm-button'));

    await waitFor(() => expect(getByText('Invalid credentials')).toBeTruthy());
    expect(getByTestId('step-up-reauth')).toBeTruthy();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('rejects with StepUpCancelledError when the prompt is dismissed', async () => {
    const action = jest.fn().mockRejectedValueOnce(stepUpRequired());
    const { getByTestId, queryByTestId } = await render(<Harness action={action} />);

    await fireEvent.press(getByTestId('run'));
    await waitFor(() => expect(getByTestId('step-up-reauth')).toBeTruthy());

    await fireEvent.press(getByTestId('step-up-cancel-button'));

    await waitFor(() =>
      expect(getByTestId('error')).toHaveTextContent(new StepUpCancelledError().name),
    );
    expect(queryByTestId('step-up-reauth')).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
