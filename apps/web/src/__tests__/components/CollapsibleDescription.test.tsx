import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleDescription } from '#/routes/_authenticated/applications/$applicationId/-components/CollapsibleDescription';

// jsdom does no layout, so heights are stubbed: a paragraph "overflows" when
// its scrollHeight exceeds its clientHeight, as it does with a clamped long text.
function stubHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

describe('CollapsibleDescription (JEF-403)', () => {
  it('starts clamped to three lines with a Show more toggle when the text overflows', () => {
    stubHeights(200, 60);
    render(<CollapsibleDescription text="A very long job description" />);

    expect(screen.getByText('A very long job description')).toHaveClass('line-clamp-3');
    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands and collapses again from the toggle', () => {
    stubHeights(200, 60);
    render(<CollapsibleDescription text="A very long job description" />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText('A very long job description')).not.toHaveClass('line-clamp-3');
    const less = screen.getByRole('button', { name: 'Show less' });
    expect(less).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(less);
    expect(screen.getByText('A very long job description')).toHaveClass('line-clamp-3');
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('offers no toggle when the text fits in three lines', () => {
    stubHeights(60, 60);
    render(<CollapsibleDescription text="Short" />);

    expect(screen.getByText('Short')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
