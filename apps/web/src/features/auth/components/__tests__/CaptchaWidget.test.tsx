import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

type Options = {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

async function load(siteKey: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey as string);
  return import('../CaptchaWidget');
}

function installTurnstile() {
  const render = vi.fn<(el: HTMLElement, o: Options) => string>(() => 'widget-1');
  const remove = vi.fn();
  window.turnstile = { render, remove } as unknown as Window['turnstile'];
  return { render, remove };
}

describe('CaptchaWidget', () => {
  beforeEach(() => {
    delete window.turnstile;
    document.head.querySelectorAll('script[src*="turnstile"]').forEach((s) => s.remove());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  it('renders nothing and reports no token when no site key is set', async () => {
    const { CaptchaWidget, CAPTCHA_ENABLED } = await load('');
    const onToken = vi.fn();
    render(<CaptchaWidget onToken={onToken} />);
    expect(CAPTCHA_ENABLED).toBe(false);
    expect(screen.queryByTestId('captcha-widget')).toBeNull();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('is disabled when the env var is absent', async () => {
    const { CAPTCHA_ENABLED } = await load(undefined);
    expect(CAPTCHA_ENABLED).toBe(false);
  });

  it('renders the widget with the site key and forwards each callback', async () => {
    const { CaptchaWidget, CAPTCHA_ENABLED } = await load('site-key');
    const { render: renderWidget } = installTurnstile();
    const onToken = vi.fn();
    render(<CaptchaWidget onToken={onToken} />);
    await act(async () => {});

    expect(CAPTCHA_ENABLED).toBe(true);
    const container = screen.getByTestId('captcha-widget');
    expect(renderWidget).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ sitekey: 'site-key', theme: 'auto' }),
    );
    const options = renderWidget.mock.calls[0]![1];
    options.callback('tok');
    expect(onToken).toHaveBeenLastCalledWith('tok');
    options['expired-callback']();
    expect(onToken).toHaveBeenLastCalledWith(null);
    onToken.mockClear();
    options['error-callback']();
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('reaches the latest onToken after a re-render', async () => {
    const { CaptchaWidget } = await load('site-key');
    const { render: renderWidget } = installTurnstile();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<CaptchaWidget onToken={first} />);
    await act(async () => {});
    rerender(<CaptchaWidget onToken={second} />);
    renderWidget.mock.calls[0]![1].callback('tok');
    expect(second).toHaveBeenCalledWith('tok');
    expect(first).not.toHaveBeenCalledWith('tok');
  });

  it('removes the widget and clears the token on unmount', async () => {
    const { CaptchaWidget } = await load('site-key');
    const { remove } = installTurnstile();
    const onToken = vi.fn();
    const { unmount } = render(<CaptchaWidget onToken={onToken} />);
    await act(async () => {});
    unmount();
    expect(remove).toHaveBeenCalledWith('widget-1');
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it('does not render when unmounted before the script finishes loading', async () => {
    const { CaptchaWidget } = await load('site-key');
    const turnstile = installTurnstile();
    const { unmount } = render(<CaptchaWidget onToken={vi.fn()} />);
    unmount();
    await act(async () => {});
    expect(turnstile.remove).not.toHaveBeenCalled();
  });

  it('loads the script once, then renders when it signals load', async () => {
    const { CaptchaWidget } = await load('site-key');
    const onToken = vi.fn();
    render(<CaptchaWidget onToken={onToken} />);
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="turnstile"]');
    expect(script?.async).toBe(true);
    const turnstile = installTurnstile();
    await act(async () => {
      script?.onload?.(new Event('load'));
    });
    expect(turnstile.render).toHaveBeenCalledOnce();
  });

  it('reports no token when the script loads without the global', async () => {
    const { CaptchaWidget } = await load('site-key');
    const onToken = vi.fn();
    render(<CaptchaWidget onToken={onToken} />);
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="turnstile"]');
    await act(async () => {
      script?.onload?.(new Event('load'));
    });
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('reports no token on a script error, and the next mount tries again', async () => {
    const { CaptchaWidget } = await load('site-key');
    const onToken = vi.fn();
    const first = render(<CaptchaWidget onToken={onToken} />);
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="turnstile"]');
    await act(async () => {
      script?.onerror?.(new Event('error'));
    });
    expect(onToken).toHaveBeenCalledWith(null);
    first.unmount();

    render(<CaptchaWidget onToken={onToken} />);
    expect(document.head.querySelectorAll('script[src*="turnstile"]')).toHaveLength(2);
  });
});
