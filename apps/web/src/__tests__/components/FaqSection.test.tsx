import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaqSection, serializeJsonLd, type FaqItem } from '#/components/marketing/FaqSection';

const STRINGS: Record<string, string> = {
  'faq.title': 'Frequently asked questions',
  'q.one': 'Is it free up to {{limit}}?',
  'a.one': 'Yes, up to {{limit}}.',
  'q.two': 'Is "markup" safe?',
  'a.two': 'Yes: </script><b>safe</b>',
};

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    t: (key: string, options?: Record<string, string | number>) =>
      (STRINGS[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? ''),
      ),
  }),
}));

const ITEMS: FaqItem[] = [
  { id: 'one', questionKey: 'q.one', answerKey: 'a.one', values: { limit: 50 } },
  { id: 'two', questionKey: 'q.two', answerKey: 'a.two' },
];

function jsonLd(container: HTMLElement) {
  const script = container.querySelector('script[type="application/ld+json"]');
  return script ? (JSON.parse(script.textContent ?? '') as Record<string, unknown>) : null;
}

describe('FaqSection', () => {
  it('renders a heading and one collapsed details element per question', () => {
    render(<FaqSection items={ITEMS} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Frequently asked questions' }),
    ).toBeInTheDocument();
    const details = screen.getAllByTestId(/^faq-/);
    expect(details).toHaveLength(2);
    for (const el of details) expect(el).not.toHaveAttribute('open');
  });

  it('interpolates values into both the question and the answer', () => {
    render(<FaqSection items={ITEMS} />);

    expect(screen.getByText('Is it free up to 50?')).toBeInTheDocument();
    expect(screen.getByText('Yes, up to 50.')).toBeInTheDocument();
  });

  // jsdom does not turn Enter/Space on a <summary> into a click, so the real
  // keyboard behaviour is checked in a browser; here: each question is a tab
  // stop, in order, and activating it toggles its answer.
  it('makes each question a tab stop that toggles its answer', async () => {
    const user = userEvent.setup();
    render(<FaqSection items={ITEMS} />);
    const first = screen.getByText('Is it free up to 50?').closest('summary')!;
    const second = screen.getByText('Is "markup" safe?').closest('summary')!;

    await user.tab();
    expect(first).toHaveFocus();
    await user.tab();
    expect(second).toHaveFocus();

    await user.click(first);
    expect(screen.getByTestId('faq-one')).toHaveAttribute('open');
    await user.click(first);
    expect(screen.getByTestId('faq-one')).not.toHaveAttribute('open');
  });

  it('emits no structured data unless asked', () => {
    const { container } = render(<FaqSection items={ITEMS} />);
    expect(jsonLd(container)).toBeNull();
  });

  it('emits FAQPage JSON-LD that matches the visible text', () => {
    const { container } = render(<FaqSection items={ITEMS} structuredData />);

    expect(jsonLd(container)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is it free up to 50?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, up to 50.' },
        },
        {
          '@type': 'Question',
          name: 'Is "markup" safe?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes: </script><b>safe</b>' },
        },
      ],
    });
  });

  it('cannot be closed early by a </script> inside an answer', () => {
    expect(serializeJsonLd({ text: '</script><img>' })).not.toContain('<');
    const { container } = render(<FaqSection items={ITEMS} structuredData />);
    expect(container.querySelectorAll('script')).toHaveLength(1);
  });
});
