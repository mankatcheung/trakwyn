import { useCallback, useState } from 'react';
import { CAPTCHA_ENABLED } from '#/components/CaptchaWidget';

/**
 * State for one `<CaptchaWidget>` (JEF-401): the current token, and a way to
 * discard it. A token works once, so a form calls `reset` after every submit
 * that used it, and gives the widget `key={widgetKey}` to get a fresh one.
 */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setWidgetKey((key) => key + 1);
  }, []);

  return {
    token,
    setToken,
    widgetKey,
    reset,
    /** True while a widget is configured and has not been solved yet. */
    pending: CAPTCHA_ENABLED && token === null,
  };
}
