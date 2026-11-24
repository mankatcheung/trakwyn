import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardScroller } from '#/features/applications/components/board/BoardScroller';

function setGeometry(el: HTMLElement, geometry: Record<string, number>) {
  for (const [key, value] of Object.entries(geometry)) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
}

describe('BoardScroller', () => {
  it('is a focusable, labelled region so the arrow keys can scroll it', () => {
    render(<BoardScroller>x</BoardScroller>);
    const region = screen.getByRole('region', { name: 'Board columns' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('shows no fade when every column fits', () => {
    render(<BoardScroller>x</BoardScroller>);
    expect(screen.queryByTestId('board-fade-end')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-fade-start')).not.toBeInTheDocument();
  });

  it('fades the end while columns overflow, and the start once scrolled', () => {
    render(<BoardScroller>x</BoardScroller>);
    const region = screen.getByTestId('board-scroller');
    setGeometry(region, { clientWidth: 400, scrollWidth: 1000, scrollLeft: 0 });
    fireEvent.scroll(region);
    expect(screen.getByTestId('board-fade-end')).toBeInTheDocument();
    expect(screen.queryByTestId('board-fade-start')).not.toBeInTheDocument();

    setGeometry(region, { scrollLeft: 300 });
    fireEvent.scroll(region);
    expect(screen.getByTestId('board-fade-start')).toBeInTheDocument();
    expect(screen.getByTestId('board-fade-end')).toBeInTheDocument();

    setGeometry(region, { scrollLeft: 600 });
    fireEvent.scroll(region);
    expect(screen.queryByTestId('board-fade-end')).not.toBeInTheDocument();
  });
});
