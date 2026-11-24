import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('renders a spinning ring', () => {
    const { container } = render(<Spinner />);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('animate-spin');
  });

  it('defaults to sm size and gray tone', () => {
    const { container } = render(<Spinner />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('w-3.5');
    expect(el.className).toContain('border-stone-300');
  });

  it('applies the md size', () => {
    const { container } = render(<Spinner size="md" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('w-5');
  });

  it('applies the white tone', () => {
    const { container } = render(<Spinner tone="white" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('border-white');
  });
});
