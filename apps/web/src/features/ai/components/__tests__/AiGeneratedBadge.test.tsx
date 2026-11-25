import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { AiGeneratedBadge } from '#/features/ai/components/AiGeneratedBadge';

describe('AiGeneratedBadge', () => {
  it('says "AI generated" by default', () => {
    render(<AiGeneratedBadge />);

    expect(screen.getByText('AI generated')).toBeInTheDocument();
  });

  it('takes a more specific label', () => {
    render(<AiGeneratedBadge label="AI generated draft" />);

    expect(screen.getByText('AI generated draft')).toBeInTheDocument();
    expect(screen.queryByText('AI generated')).not.toBeInTheDocument();
  });

  it('is a plain neutral label: no icon, no violet tint (JEF-693)', () => {
    const { container } = render(<AiGeneratedBadge />);

    expect(container.querySelector('svg')).toBeNull();
    const badge = screen.getByText('AI generated');
    expect(badge.className).toContain('stone');
    expect(badge.className).not.toMatch(/violet|purple|blue/);
  });

  it('rewords the default label when the language changes', async () => {
    render(<AiGeneratedBadge />);
    i18next.addResourceBundle('en-GB', 'translation', {
      'interviews.aiGenerated': 'Made by AI',
    });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByText('Made by AI')).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(screen.getByText('AI generated')).toBeInTheDocument();
  });

  it('follows its label as it changes', () => {
    const { rerender } = render(<AiGeneratedBadge />);
    rerender(<AiGeneratedBadge label="Drafted by AI" />);

    expect(screen.getByText('Drafted by AI')).toBeInTheDocument();

    rerender(<AiGeneratedBadge />);
    expect(screen.getByText('AI generated')).toBeInTheDocument();
  });
});
