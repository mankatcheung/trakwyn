import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LOCALE_INIT_SCRIPT, LocaleProvider, useLocale } from '#/lib/i18n';

function Probe() {
  const { locale, t, formatNumber } = useLocale();
  return (
    <output>
      {locale}|{t('nav.dashboard')}|{formatNumber(1234567)}
    </output>
  );
}

describe('i18n', () => {
  it('falls back to English when no locale is stored', () => {
    localStorage.removeItem('locale');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText(/\|Dashboard\|/)).toBeInTheDocument();
  });

  it('uses a URL locale and updates document language', async () => {
    window.history.replaceState({}, '', '/?locale=zh-CN');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    // Non-English bundles load on demand (JEF-167), so the translated string
    // appears a tick after mount rather than synchronously.
    expect(await screen.findByText(/zh-CN\|仪表盘\|/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('renders the English fallback before a lazily-loaded bundle arrives, then swaps', async () => {
    window.history.replaceState({}, '', '/?locale=zh-TW');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    // The locale itself is correct immediately — only the strings lag.
    expect(screen.getByText(/^zh-TW\|/)).toBeInTheDocument();
    expect(await screen.findByText(/zh-TW\|儀表板\|/)).toBeInTheDocument();
  });

  it('loads the target bundle before switching, so setLocale never flashes English', async () => {
    window.history.replaceState({}, '', '/?locale=en');
    function SwitchProbe() {
      const { locale, setLocale, t } = useLocale();
      return (
        <>
          <output>
            {locale}|{t('nav.dashboard')}
          </output>
          {/* eslint-disable-next-line i18next/no-literal-string -- test fixture label, not user-facing copy */}
          <button onClick={() => setLocale('zh-CN')}>switch</button>
        </>
      );
    }
    render(
      <LocaleProvider>
        <SwitchProbe />
      </LocaleProvider>,
    );
    expect(screen.getByText(/^en\|Dashboard$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'switch' }));

    // Goes straight to the translated string — never an intermediate
    // "zh-CN|Dashboard" state.
    expect(await screen.findByText(/^zh-CN\|仪表盘$/)).toBeInTheDocument();
  });

  it('substitutes interpolation values and picks the plural form from count', () => {
    window.history.replaceState({}, '', '/?locale=en');
    function InterpolationProbe() {
      const { t } = useLocale();
      return (
        <output>
          {t('applications.selectCompany', { company: 'Acme' })}|
          {t('applications.deleted', { count: 1 })}|{t('applications.deleted', { count: 3 })}
        </output>
      );
    }
    render(
      <LocaleProvider>
        <InterpolationProbe />
      </LocaleProvider>,
    );
    expect(
      screen.getByText('Select Acme|1 application deleted|3 applications deleted'),
    ).toBeInTheDocument();
  });
});

describe('a locale named by the URL (JEF-653)', () => {
  it('wins over the stored locale', async () => {
    localStorage.setItem('locale', 'zh-CN');
    window.history.replaceState({}, '', '/zh-hk/pricing');
    render(
      <LocaleProvider urlLocale="zh-HK">
        <Probe />
      </LocaleProvider>,
    );
    // The locale is right on the first render, which is what the server HTML had.
    expect(screen.getByText(/^zh-HK\|/)).toBeInTheDocument();
    expect(await screen.findByText(/zh-HK\|主頁\|/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-HK');
    localStorage.removeItem('locale');
  });

  it('follows the URL when it changes, as back/forward and the picker do', async () => {
    window.history.replaceState({}, '', '/zh-tw/pricing');
    const { rerender } = render(
      <LocaleProvider urlLocale="zh-TW">
        <Probe />
      </LocaleProvider>,
    );
    expect(await screen.findByText(/zh-TW\|儀表板\|/)).toBeInTheDocument();

    window.history.replaceState({}, '', '/pricing');
    rerender(
      <LocaleProvider urlLocale="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(await screen.findByText(/^en\|Dashboard\|/)).toBeInTheDocument();
  });

  it('tells the root when a language is picked, so it can move to that locale’s URL', async () => {
    window.history.replaceState({}, '', '/zh-hk/pricing');
    const onLocaleChange = vi.fn();
    function PickProbe() {
      const { locale, setLocale } = useLocale();
      return (
        <>
          <output>{locale}</output>
          {/* eslint-disable-next-line i18next/no-literal-string -- test fixture label, not user-facing copy */}
          <button onClick={() => setLocale('zh-TW')}>pick</button>
        </>
      );
    }
    render(
      <LocaleProvider urlLocale="zh-HK" onLocaleChange={onLocaleChange}>
        <PickProbe />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick' }));

    expect(onLocaleChange).toHaveBeenCalledExactlyOnceWith('zh-TW');
    expect(await screen.findByText('zh-TW')).toBeInTheDocument();
  });

  it('does not add ?locale= to a page whose language is in its path', async () => {
    window.history.replaceState({}, '', '/zh-cn/pricing');
    render(
      <LocaleProvider urlLocale="zh-CN">
        <Probe />
      </LocaleProvider>,
    );
    await screen.findByText(/zh-CN\|仪表盘\|/);
    expect(window.location.pathname).toBe('/zh-cn/pricing');
    expect(window.location.search).toBe('');
  });

  it('still writes ?locale= on a page that has no per-locale URL', async () => {
    window.history.replaceState({}, '', '/login');
    render(
      <LocaleProvider urlLocale="zh-CN">
        <Probe />
      </LocaleProvider>,
    );
    await screen.findByText(/zh-CN\|仪表盘\|/);
    expect(window.location.search).toBe('?locale=zh-CN');
  });
});

describe('LOCALE_INIT_SCRIPT (JEF-653)', () => {
  function runScript(): string {
    document.documentElement.lang = '';
    new Function(LOCALE_INIT_SCRIPT)();
    return document.documentElement.lang;
  }

  it('labels a prefixed page with its own language, not the stored one', () => {
    localStorage.setItem('locale', 'en');
    window.history.replaceState({}, '', '/zh-hk/pricing');
    expect(runScript()).toBe('zh-HK');
    localStorage.removeItem('locale');
  });

  it('keeps the old order for an unprefixed page: query, then stored', () => {
    localStorage.setItem('locale', 'zh-CN');
    window.history.replaceState({}, '', '/pricing');
    expect(runScript()).toBe('zh-CN');
    window.history.replaceState({}, '', '/pricing?locale=zh-TW');
    expect(runScript()).toBe('zh-TW');
    localStorage.removeItem('locale');
  });

  it('ignores a prefix that is not an indexed locale', () => {
    localStorage.setItem('locale', 'zh-CN');
    window.history.replaceState({}, '', '/xx/pricing');
    expect(runScript()).toBe('zh-CN');
    localStorage.removeItem('locale');
  });
});
