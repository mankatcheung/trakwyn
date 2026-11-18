import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProviderKeyTabs } from '../ProviderKeyTabs';

const tab = (name: RegExp | string) => screen.getByRole('tab', { name });

describe('ProviderKeyTabs', () => {
  it('lists the five providers, with OpenRouter selected first', () => {
    render(<ProviderKeyTabs />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(tab('OpenRouter')).toHaveAttribute('aria-selected', 'true');
    expect(tab('OpenAI')).toHaveAttribute('aria-selected', 'false');
  });

  it('links to the selected provider’s key page', () => {
    render(<ProviderKeyTabs />);
    expect(document.querySelector('a')).toHaveAttribute('href', 'https://openrouter.ai/keys');
    expect(document.querySelector('a')).toHaveAttribute('target', '_blank');
    expect(document.querySelector('a')).toHaveAttribute('rel', 'noreferrer');
  });

  it.each([
    ['OpenAI', 'https://platform.openai.com/api-keys'],
    ['Anthropic', 'https://console.anthropic.com'],
    ['Google AI', 'https://aistudio.google.com/apikey'],
  ])('switching to %s selects it and points the link at %s', (name, href) => {
    render(<ProviderKeyTabs />);
    fireEvent.click(tab(name));
    expect(tab(name)).toHaveAttribute('aria-selected', 'true');
    expect(tab('OpenRouter')).toHaveAttribute('aria-selected', 'false');
    expect(document.querySelector('a')).toHaveAttribute('href', href);
  });

  it('shows a different note per provider', () => {
    render(<ProviderKeyTabs />);
    const notes = new Set<string | null>();
    for (const tabEl of screen.getAllByRole('tab')) {
      fireEvent.click(tabEl);
      notes.add(document.querySelector('p')?.textContent ?? null);
    }
    expect(notes.size).toBe(5);
  });

  it('has no link on the custom endpoint tab', () => {
    render(<ProviderKeyTabs />);
    fireEvent.click(screen.getAllByRole('tab')[4]!);
    expect(document.querySelector('a')).toBeNull();
  });

  it('keeps its output on a re-render and when the same tab is chosen again', () => {
    const { container, rerender } = render(<ProviderKeyTabs />);
    const before = container.innerHTML;
    rerender(<ProviderKeyTabs />);
    expect(container.innerHTML).toBe(before);
    fireEvent.click(tab('OpenRouter'));
    expect(container.innerHTML).toBe(before);
  });
});
