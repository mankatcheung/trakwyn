import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useKeyboardVerticalOffset, type ViewElement } from '../useKeyboardVerticalOffset';

/** Stands in for the native marker view: reports the window position the test chooses. */
function markerAt(y: number) {
  return {
    measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) =>
      callback(0, y, 0, 0),
  } as unknown as ViewElement;
}

describe('useKeyboardVerticalOffset (JEF-377)', () => {
  const originalOs = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOs;
  });

  it('starts at zero, before anything has been laid out', async () => {
    Platform.OS = 'ios';
    const { result } = await renderHook(() => useKeyboardVerticalOffset());

    expect(result.current.keyboardVerticalOffset).toBe(0);
  });

  it("reports the marker's distance from the top of the window on iOS", async () => {
    Platform.OS = 'ios';
    const { result } = await renderHook(() => useKeyboardVerticalOffset());

    await act(async () => {
      result.current.measureProps.ref.current = markerAt(109);
      result.current.measureProps.onLayout();
    });

    expect(result.current.keyboardVerticalOffset).toBe(109);
  });

  it('follows the marker when a later layout moves it', async () => {
    Platform.OS = 'ios';
    const { result } = await renderHook(() => useKeyboardVerticalOffset());

    await act(async () => {
      result.current.measureProps.ref.current = markerAt(109);
      result.current.measureProps.onLayout();
    });
    await act(async () => {
      result.current.measureProps.ref.current = markerAt(62);
      result.current.measureProps.onLayout();
    });

    expect(result.current.keyboardVerticalOffset).toBe(62);
  });

  it('does nothing before the marker view exists', async () => {
    Platform.OS = 'ios';
    const { result } = await renderHook(() => useKeyboardVerticalOffset());

    await act(async () => {
      result.current.measureProps.onLayout();
    });

    expect(result.current.keyboardVerticalOffset).toBe(0);
  });

  it('gives no offset on Android, where the keyboard view does not pad', async () => {
    Platform.OS = 'android';
    const { result } = await renderHook(() => useKeyboardVerticalOffset());

    await act(async () => {
      result.current.measureProps.ref.current = markerAt(109);
      result.current.measureProps.onLayout();
    });

    expect(result.current.keyboardVerticalOffset).toBeUndefined();
  });
});
