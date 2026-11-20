import { Platform, Text } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';

jest.mock('../../hooks/useKeyboardVerticalOffset', () => ({
  useKeyboardVerticalOffset: jest.fn(),
}));
// The real view keeps `keyboardVerticalOffset` to itself, so a spy records the props it is given.
const mockKeyboardAvoidingView = jest.fn();
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: { children?: unknown }) => {
      mockKeyboardAvoidingView(props);
      return <View testID="kav">{props.children as never}</View>;
    },
  };
});

import { useKeyboardVerticalOffset } from '../../hooks/useKeyboardVerticalOffset';
import { KeyboardAvoidingScreen } from '../KeyboardAvoidingScreen';

const mockUseOffset = useKeyboardVerticalOffset as jest.Mock;
const onLayout = jest.fn();
const ref = { current: null };

function setOffset(keyboardVerticalOffset: number | undefined) {
  mockUseOffset.mockReturnValue({ keyboardVerticalOffset, measureProps: { ref, onLayout } });
}

describe('KeyboardAvoidingScreen', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
    jest.clearAllMocks();
  });

  it('passes the measured offset and iOS padding behaviour to the keyboard view', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    setOffset(96);
    await render(
      <KeyboardAvoidingScreen>
        <Text>content</Text>
      </KeyboardAvoidingScreen>,
    );

    expect(screen.getByText('content')).toBeTruthy();
    expect(mockKeyboardAvoidingView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'padding', keyboardVerticalOffset: 96 }),
    );
  });

  it('leaves behaviour unset on Android', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    setOffset(undefined);
    await render(
      <KeyboardAvoidingScreen>
        <Text>content</Text>
      </KeyboardAvoidingScreen>,
    );

    const props = mockKeyboardAvoidingView.mock.calls[0][0];
    expect(props.behavior).toBeUndefined();
    expect(props.keyboardVerticalOffset).toBeUndefined();
  });

  it('wraps the keyboard view in the measured, non-collapsable view carrying the testID', async () => {
    setOffset(0);
    await render(
      <KeyboardAvoidingScreen testID="screen-root">
        <Text>content</Text>
      </KeyboardAvoidingScreen>,
    );

    const root = screen.getByTestId('screen-root');
    expect(root.props.collapsable).toBe(false);
    expect(root.props.onLayout).toBe(onLayout);
    expect(within(root).getByTestId('kav')).toBeTruthy();
  });

  it('merges the caller styles onto the keyboard view and the container', async () => {
    setOffset(0);
    await render(
      <KeyboardAvoidingScreen
        testID="screen-root"
        style={{ backgroundColor: 'red' }}
        containerStyle={{ backgroundColor: 'blue' }}
      >
        <Text>content</Text>
      </KeyboardAvoidingScreen>,
    );

    expect(screen.getByTestId('screen-root')).toHaveStyle({ flex: 1, backgroundColor: 'blue' });
    expect(mockKeyboardAvoidingView.mock.calls[0][0].style).toEqual([
      { flex: 1 },
      { backgroundColor: 'red' },
    ]);
  });
});
