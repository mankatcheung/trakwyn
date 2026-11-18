import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionGeneratedMarker } from '#/features/application-detail/components/sections/SectionGeneratedMarker';

describe('SectionGeneratedMarker', () => {
  it('names the state as generated with a check', () => {
    render(<SectionGeneratedMarker generated />);

    const marker = screen.getByRole('img');
    expect(marker.getAttribute('aria-label')).not.toMatch(/not/i);
    expect(marker.tagName.toLowerCase()).toBe('svg');
  });

  it('names the state as not generated with a muted dot', () => {
    render(<SectionGeneratedMarker generated={false} />);

    const marker = screen.getByRole('img');
    expect(marker.getAttribute('aria-label')).toMatch(/not/i);
    expect(marker.tagName.toLowerCase()).toBe('span');
  });

  it('switches between the check and the dot as the state changes', () => {
    const { rerender } = render(<SectionGeneratedMarker generated={false} />);
    rerender(<SectionGeneratedMarker generated={false} />);
    expect(screen.getByRole('img').tagName.toLowerCase()).toBe('span');

    rerender(<SectionGeneratedMarker generated />);
    expect(screen.getByRole('img').tagName.toLowerCase()).toBe('svg');
  });

  it('passes the size to the check icon', () => {
    render(<SectionGeneratedMarker generated size={20} />);

    expect(screen.getByRole('img')).toHaveAttribute('width', '20');
  });
});
