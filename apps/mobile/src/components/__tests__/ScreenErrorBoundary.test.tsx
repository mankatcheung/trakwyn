import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ScreenErrorBoundary } from '../ScreenErrorBoundary';
import { useTheme } from '../../theme/ThemeContext';
import { lightColors } from '../../theme/colors';
import { captureException } from '../../lib/analytics';

jest.mock('../../theme/ThemeContext', () => ({ useTheme: jest.fn() }));
jest.mock('../../lib/analytics', () => ({ captureException: jest.fn() }));

const mockedUseTheme = jest.mocked(useTheme);
const mockedCaptureException = jest.mocked(captureException);

function Boom(): React.ReactElement {
  throw new Error('screen blew up');
}

/**
 * A render error is the one failure PostHog's own autocapture cannot see —
 * React catches it at the boundary before it reaches the global handler —
 * so these tests check that the explicit report happens and that the user
 * gets something other than a white screen (JEF-349).
 */
describe('ScreenErrorBoundary', () => {
  // React logs a caught render error to the console; silencing it keeps the
  // test output readable without hiding a genuine failure.
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseTheme.mockReturnValue({
      mode: 'light',
      resolvedScheme: 'light',
      colors: lightColors,
      setMode: jest.fn(),
    } as never);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it('renders its children when nothing throws', async () => {
    const { getByText, queryByTestId } = await render(
      <ScreenErrorBoundary>
        <Text>All good</Text>
      </ScreenErrorBoundary>,
    );

    expect(getByText('All good')).toBeTruthy();
    expect(queryByTestId('screen-error-boundary')).toBeNull();
  });

  it('shows a fallback instead of a blank screen when a child throws', async () => {
    const { getByTestId } = await render(
      <ScreenErrorBoundary>
        <Boom />
      </ScreenErrorBoundary>,
    );

    expect(getByTestId('screen-error-boundary')).toBeTruthy();
  });

  it('reports the error with the component stack, which names the screen a Hermes stack would not', async () => {
    await render(
      <ScreenErrorBoundary>
        <Boom />
      </ScreenErrorBoundary>,
    );

    expect(mockedCaptureException).toHaveBeenCalledTimes(1);
    const [error, properties] = mockedCaptureException.mock.calls[0] as [
      Error,
      Record<string, unknown>,
    ];
    expect(error.message).toBe('screen blew up');
    expect(properties.kind).toBe('screen_error_boundary');
    expect(properties.component_stack).toEqual(expect.stringContaining('Boom'));
  });

  it('lets the user retry, which re-renders the children', async () => {
    // Throws on the first render only, so the retry has something to show.
    let shouldThrow = true;
    function Flaky(): React.ReactElement {
      if (shouldThrow) throw new Error('screen blew up');
      return <Text>Recovered</Text>;
    }

    const { getByRole, findByText } = await render(
      <ScreenErrorBoundary>
        <Flaky />
      </ScreenErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.press(getByRole('button'));

    expect(await findByText('Recovered')).toBeTruthy();
  });
});
