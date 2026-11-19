import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockSetTheme, mockUseTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseTheme: vi.fn(),
}));

vi.mock('#/lib/theme', () => ({
  useTheme: mockUseTheme,
}));

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    t: (key: string) =>
      ({
        'profile.appearanceTitle': 'Appearance',
        'profile.themeLight': 'Light',
        'profile.themeDark': 'Dark',
        'profile.themeSystem': 'System',
      })[key] ?? key,
  }),
}));

import { MarketingThemeToggle } from '#/features/marketing/components/MarketingThemeToggle';

describe('MarketingThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows all three options in a labelled group', () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });

    render(<MarketingThemeToggle />);

    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
  });

  it.each([
    ['light', 'Light'],
    ['dark', 'Dark'],
    ['system', 'System'],
  ] as const)('marks only the current theme (%s) as pressed', (theme, label) => {
    mockUseTheme.mockReturnValue({ theme, setTheme: mockSetTheme });

    render(<MarketingThemeToggle />);

    for (const name of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        String(name === label),
      );
    }
  });

  it.each([
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['System', 'system'],
  ] as const)('picks %s in one click, whatever is selected now', (label, value) => {
    mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme });

    render(<MarketingThemeToggle />);
    screen.getByRole('button', { name: label }).click();

    expect(mockSetTheme).toHaveBeenCalledWith(value);
  });
});
