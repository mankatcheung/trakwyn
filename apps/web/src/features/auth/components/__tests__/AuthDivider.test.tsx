import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthDivider } from '#/features/auth/components/AuthDivider';

describe('AuthDivider', () => {
  it('shows its label on the rule', () => {
    render(<AuthDivider label="or continue with email" />);

    expect(screen.getByText('or continue with email')).toBeInTheDocument();
  });

  it('follows the label when it changes', () => {
    const { rerender } = render(<AuthDivider label="or" />);
    rerender(<AuthDivider label="or" />);
    expect(screen.getByText('or')).toBeInTheDocument();

    rerender(<AuthDivider label="oder" />);
    expect(screen.getByText('oder')).toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });
});
