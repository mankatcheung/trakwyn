import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import en from '#/i18n/en.json';
import enGB from '#/i18n/en-GB.json';
import zhCN from '#/i18n/zh-CN.json';
import zhHK from '#/i18n/zh-HK.json';
import zhTW from '#/i18n/zh-TW.json';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
}));

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));
vi.mock('#/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/analytics/analytics')>()),
  captureEvent: mockCapture,
}));

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
  }),
}));

import { AiDemoSection } from '#/components/marketing/AiDemoSection';

describe('AiDemoSection (JEF-517)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the posting and the tailored letter without any interaction', () => {
    render(<AiDemoSection />);

    const section = screen.getByRole('region', { name: en['landing.aiDemo.title'] });
    expect(within(section).getByText(en['landing.aiDemo.postingRole'])).toBeVisible();
    expect(within(section).getByText(en['landing.aiDemo.postingReq1'])).toBeVisible();
    expect(within(section).getByText(en['landing.aiDemo.letterBody'])).toBeVisible();
    expect(within(section).getByText(en['landing.aiDemo.groundedBadge'])).toBeVisible();
  });

  it('uses fictional names only', () => {
    render(<AiDemoSection />);

    expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
    expect(screen.getByText(/careers\.northwind\.example/)).toBeInTheDocument();
  });

  it('links to the resume and cover letter feature page', () => {
    render(<AiDemoSection />);

    expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
      'href',
      '/features/resume-cover-letter',
    );
  });

  it('sends the register CTA to /register and reports where it was clicked', async () => {
    const user = userEvent.setup();
    render(<AiDemoSection />);

    const cta = screen.getByRole('link', { name: 'Start for free' });
    expect(cta).toHaveAttribute('href', '/register');
    await user.click(cta);

    expect(mockCapture.mock.calls).toEqual([
      ['marketing_cta_clicked', { cta: 'start_free', location: 'ai_demo' }],
    ]);
  });

  it.each([
    ['en', en],
    ['en-GB', enGB],
    ['zh-CN', zhCN],
    ['zh-HK', zhHK],
    ['zh-TW', zhTW],
  ])('has every landing.aiDemo key in %s', (_name, bundle) => {
    const wanted = Object.keys(en).filter((key) => key.startsWith('landing.aiDemo.'));
    expect(wanted.length).toBeGreaterThan(0);
    for (const key of wanted) {
      expect((bundle as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
