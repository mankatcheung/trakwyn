import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCaptcha } from '#/features/auth/hooks/useCaptcha';

const captcha = vi.hoisted(() => ({ enabled: true }));
vi.mock('#/features/auth/components/CaptchaWidget', () => ({
  get CAPTCHA_ENABLED() {
    return captcha.enabled;
  },
}));

describe('useCaptcha (JEF-401)', () => {
  beforeEach(() => {
    captcha.enabled = true;
  });

  it('starts with no token, and is pending while a widget is configured', () => {
    const { result } = renderHook(() => useCaptcha());
    expect(result.current.token).toBeNull();
    expect(result.current.pending).toBe(true);
  });

  it('is never pending when no widget is configured', () => {
    captcha.enabled = false;
    const { result } = renderHook(() => useCaptcha());
    expect(result.current.pending).toBe(false);
  });

  it('stops being pending once the widget is solved', () => {
    const { result } = renderHook(() => useCaptcha());
    act(() => result.current.setToken('tok'));
    expect(result.current.token).toBe('tok');
    expect(result.current.pending).toBe(false);
  });

  it('reset discards the token and changes the widget key for a fresh widget', () => {
    const { result } = renderHook(() => useCaptcha());
    const firstKey = result.current.widgetKey;
    act(() => result.current.setToken('tok'));
    act(() => result.current.reset());
    expect(result.current.token).toBeNull();
    expect(result.current.pending).toBe(true);
    expect(result.current.widgetKey).toBe(firstKey + 1);
  });

  it('keeps reset stable across renders', () => {
    const { result, rerender } = renderHook(() => useCaptcha());
    const reset = result.current.reset;
    rerender();
    expect(result.current.reset).toBe(reset);
  });
});
