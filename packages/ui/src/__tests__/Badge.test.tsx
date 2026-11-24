import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>applied</Badge>);
    expect(screen.getByText('applied')).toBeInTheDocument();
  });

  it('defaults to the gray tone', () => {
    render(<Badge>draft</Badge>);
    expect(screen.getByText('draft').className).toContain('bg-stone-100');
  });

  it('applies the requested tone', () => {
    render(<Badge tone="green">accepted</Badge>);
    expect(screen.getByText('accepted').className).toContain('bg-green-100');
  });
});
