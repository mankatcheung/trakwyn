import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { AccountAvatarIcon, BottomNavItem, NavItem } from '../NavItems';

describe('AccountAvatarIcon', () => {
  it('shows the avatar image at the given size', () => {
    render(<AccountAvatarIcon avatarUrl="https://img.test/a.png" size={32} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://img.test/a.png');
    expect(img).toHaveStyle({ width: '32px', height: '32px' });
  });

  it.each([null, undefined, ''])('falls back to the user icon for %j', (avatarUrl) => {
    const { container } = render(<AccountAvatarIcon avatarUrl={avatarUrl} size={20} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute('width', '20');
  });
});

describe('NavItem', () => {
  const icon = <span data-testid="icon" />;

  it('links to its target with the icon and label', () => {
    render(<NavItem to="/dashboard" icon={icon} label="Dashboard" active={false} />);
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('highlights the active item only', () => {
    const { rerender } = render(<NavItem to="/a" icon={icon} label="A" active />);
    expect(screen.getByRole('link')).toHaveClass('bg-blue-50');
    rerender(<NavItem to="/a" icon={icon} label="A" active={false} />);
    expect(screen.getByRole('link')).not.toHaveClass('bg-blue-50');
  });
});

describe('BottomNavItem', () => {
  it('links to its target with the icon and label', () => {
    render(
      <BottomNavItem to="/jobs" icon={<span data-testid="i" />} label="Jobs" active={false} />,
    );
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
    expect(screen.getByTestId('i')).toBeInTheDocument();
  });

  it('colours the active item blue and the others grey', () => {
    const { rerender } = render(<BottomNavItem to="/j" icon={null} label="J" active />);
    expect(screen.getByRole('link')).toHaveClass('text-blue-800');
    rerender(<BottomNavItem to="/j" icon={null} label="J" active={false} />);
    expect(screen.getByRole('link')).toHaveClass('text-stone-500');
  });
});

describe('re-rendering with the same props', () => {
  it('keeps the output of each item', () => {
    const icon = <span data-testid="icon" />;
    const ui = () => (
      <>
        <AccountAvatarIcon avatarUrl="https://img.test/a.png" size={24} />
        <NavItem to="/a" icon={icon} label="A" active />
        <BottomNavItem to="/b" icon={icon} label="B" active={false} />
      </>
    );
    const { container, rerender } = render(ui());
    const before = container.innerHTML;
    rerender(ui());
    expect(container.innerHTML).toBe(before);
  });
});
