import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme: 'auto';
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * The Cloudflare Turnstile site key (JEF-401). Public by design. Left blank in
 * local dev and CI, where the API's captcha is permissive and there is no
 * widget to solve: the pages then submit with no token.
 */
const SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

export const CAPTCHA_ENABLED = SITE_KEY.length > 0;

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load'));
    script.onerror = () => {
      // Let the next mount try again instead of caching the failure.
      scriptPromise = null;
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface CaptchaWidgetProps {
  /** The solved token, or `null` once it expires or the widget errors. Tokens are single-use. */
  onToken: (token: string | null) => void;
}

/**
 * Renders the Turnstile challenge and reports its token. Renders nothing when
 * no site key is configured. A parent that has spent the token remounts this
 * (a new `key`) to get a fresh one.
 */
export function CaptchaWidget({ onToken }: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!CAPTCHA_ENABLED || !containerRef.current) return;
    const container = containerRef.current;
    let widgetId: string | null = null;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId = turnstile.render(container, {
          sitekey: SITE_KEY,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          theme: 'auto',
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId !== null) window.turnstile?.remove(widgetId);
      // The token belonged to this widget. A form that shows it again (Back
      // from the 2FA step, a mode toggle) must wait for the new one rather
      // than submit this one's, which is spent or about to expire.
      onTokenRef.current(null);
    };
  }, []);

  if (!CAPTCHA_ENABLED) return null;
  return <div ref={containerRef} data-testid="captcha-widget" className="flex justify-center" />;
}
