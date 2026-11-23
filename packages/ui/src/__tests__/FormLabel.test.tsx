import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormLabel } from '../FormLabel';

describe('FormLabel', () => {
  it('renders its children', () => {
    render(<FormLabel>Email</FormLabel>);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('defaults to the sm size', () => {
    render(<FormLabel>Email</FormLabel>);
    expect(screen.getByText('Email').className).toContain('text-sm');
  });

  it('applies the xs size', () => {
    render(<FormLabel size="xs">Email</FormLabel>);
    const label = screen.getByText('Email');
    expect(label.className).toContain('text-xs');
    expect(label.className).not.toContain('dark:text-stone-300');
  });

  it('associates with a field via htmlFor', () => {
    render(
      <>
        <FormLabel htmlFor="email">Email</FormLabel>
        <input id="email" />
      </>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
