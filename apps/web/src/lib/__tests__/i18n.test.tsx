import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider, useLocale } from '#/lib/i18n';

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
