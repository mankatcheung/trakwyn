import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="No applications yet." />);
    expect(screen.getByText('No applications yet.')).toBeInTheDocument();
  });

  it('defaults to the default size', () => {
    const { container } = render(<EmptyState message="No applications yet." />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-stone-500');
  });

  it('merges className for padding, which is not baked in', () => {
    const { container } = render(<EmptyState className="py-16" message="No applications yet." />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('py-16');
  });

  it('renders an icon when passed', () => {
    render(<EmptyState icon={<svg data-testid="icon" />} message="No applications yet." />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('omits the icon wrapper when no icon is passed', () => {
    const { container } = render(<EmptyState message="No applications yet." />);
    expect(container.querySelector('.mx-auto.mb-3')).not.toBeInTheDocument();
  });

  it('renders an action when passed', () => {
    render(<EmptyState message="No offers yet." action={<a href="/new">Add one</a>} />);
    expect(screen.getByText('Add one')).toBeInTheDocument();
  });

  it('applies the compact size', () => {
    const { container } = render(<EmptyState size="compact" message="No data yet." />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('text-sm');
    expect(el.className).toContain('text-stone-400');
  });
});
