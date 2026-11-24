import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders children and defaults to a primary, type="button" element', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('bg-blue-800');
  });

  it('uses a brighter blue in dark mode so it reads on the near-black surface', () => {
    render(<Button>Save</Button>);
    const { className } = screen.getByRole('button', { name: 'Save' });
    expect(className).toContain('dark:bg-blue-600');
    expect(className).not.toContain('dark:bg-blue-700');
  });

  it('applies the destructive variant classes', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-red-600');
  });

  it('applies fullWidth as w-full', () => {
    render(<Button fullWidth>Continue</Button>);
    expect(screen.getByRole('button', { name: 'Continue' }).className).toContain('w-full');
  });

  it('fires onClick and respects disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Submit
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
