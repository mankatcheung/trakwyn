import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_INIT_SCRIPT, LocaleProvider, adoptLocaleFromQuery, useLocale } from '#/lib/i18n';

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
});

describe('the language lives in storage, not in the URL (JEF-654)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.removeItem('locale');
  });

  function SwitchProbe() {
    const { locale, setLocale } = useLocale();
    return (
      <>
        <output>{locale}</output>
        {/* eslint-disable-next-line i18next/no-literal-string -- test fixture label, not user-facing copy */}
        <button onClick={() => setLocale('zh-TW')}>pick</button>
      </>
    );
  }

  it('never writes ?locale= into a portal URL, on load or when the language changes', async () => {
    localStorage.setItem('locale', 'zh-CN');
    window.history.replaceState({}, '', '/dashboard?tab=open#top');
    render(
      <LocaleProvider>
        <SwitchProbe />
      </LocaleProvider>,
    );
    expect(await screen.findByText('zh-CN')).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=open');

    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    expect(await screen.findByText('zh-TW')).toBeInTheDocument();

    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/dashboard?tab=open#top',
    );
    expect(localStorage.getItem('locale')).toBe('zh-TW');
  });

  it('keeps en-GB on its English marketing URL, through a reload, with no query', async () => {
    window.history.replaceState({}, '', '/pricing');
    function PickGb() {
      const { locale, setLocale } = useLocale();
      return (
        <>
          <output>{locale}</output>
          {/* eslint-disable-next-line i18next/no-literal-string -- test fixture label, not user-facing copy */}
          <button onClick={() => setLocale('en-GB')}>pick</button>
        </>
      );
    }
    const first = render(
      <LocaleProvider>
        <PickGb />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'pick' }));
    expect(await screen.findByText('en-GB')).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/pricing');
    first.unmount();

    // A reload at the same URL: nothing in it names en-GB, so it comes from storage.
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText(/^en-GB\|/)).toBeInTheDocument();
  });

  it('reads the language from storage on a portal page, not from a ?locale= it did not adopt', () => {
    localStorage.setItem('locale', 'en');
    window.history.replaceState({}, '', '/login?locale=zh-CN');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText(/^en\|Dashboard\|/)).toBeInTheDocument();
  });

  describe('adoptLocaleFromQuery', () => {
    it('saves an old link’s language and takes it off the address bar, keeping the rest', async () => {
      localStorage.setItem('locale', 'en');
      window.history.replaceState({ key: 'kept' }, '', '/login?locale=zh-CN&next=%2Fdashboard#top');

      adoptLocaleFromQuery();

      expect(localStorage.getItem('locale')).toBe('zh-CN');
      expect(window.location.pathname + window.location.search + window.location.hash).toBe(
        '/login?next=%2Fdashboard#top',
      );
      expect(window.history.state).toEqual({ key: 'kept' });

      render(
        <LocaleProvider>
          <Probe />
        </LocaleProvider>,
      );
      expect(await screen.findByText(/zh-CN\|仪表盘\|/)).toBeInTheDocument();
    });

    it('lets the link win over a language already stored', () => {
      localStorage.setItem('locale', 'en');
      window.history.replaceState({}, '', '/register?locale=zh-TW');

      adoptLocaleFromQuery();

      expect(localStorage.getItem('locale')).toBe('zh-TW');
      expect(window.location.search).toBe('');
    });

    it('adopts en-GB too, which is a supported language without URLs of its own', () => {
      window.history.replaceState({}, '', '/login?locale=en-GB');

      adoptLocaleFromQuery();

      expect(localStorage.getItem('locale')).toBe('en-GB');
      expect(window.location.search).toBe('');
    });

    it.each(['/pricing?locale=zh-TW', '/?locale=zh-HK', '/zh-hk/pricing?locale=zh-CN'])(
      'leaves %s to the router, which owns ?locale= on marketing pages',
      (href) => {
        localStorage.setItem('locale', 'en');
        window.history.replaceState({}, '', href);

        adoptLocaleFromQuery();

        expect(localStorage.getItem('locale')).toBe('en');
        expect(window.location.pathname + window.location.search).toBe(href);
      },
    );

    it.each(['/login?locale=fr', '/login?locale=', '/login?locale=ZH-CN'])(
      'ignores %s, which is not a supported language',
      (href) => {
        localStorage.setItem('locale', 'en');
        window.history.replaceState({}, '', href);

        adoptLocaleFromQuery();

        expect(localStorage.getItem('locale')).toBe('en');
        expect(window.location.pathname + window.location.search).toBe(href);
      },
    );

    it('does not touch the history when there is nothing to adopt', () => {
      window.history.replaceState({}, '', '/dashboard?tab=open');
      const replaceState = vi.spyOn(window.history, 'replaceState');

      adoptLocaleFromQuery();

      expect(replaceState).not.toHaveBeenCalled();
    });

    it('leaves the URL as it was when storage is unavailable', () => {
      window.history.replaceState({}, '', '/login?locale=zh-CN');
      vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {
          throw new Error('storage blocked');
        },
      });

      expect(() => adoptLocaleFromQuery()).not.toThrow();

      expect(window.location.search).toBe('?locale=zh-CN');
    });
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
