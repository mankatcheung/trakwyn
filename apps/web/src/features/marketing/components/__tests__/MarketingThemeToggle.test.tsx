import { describe, expect, it, vi } from 'vitest';
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
    t: (key: string, options?: { theme?: string }) =>
      key === 'profile.themeAria'
        ? `Theme: ${options?.theme}`
        : ({
            'profile.themeLight': 'Light',
            'profile.themeDark': 'Dark',
            'profile.themeSystem': 'System',
          }[key] ?? key),
  }),
}));

import { MarketingThemeToggle } from '#/features/marketing/components/MarketingThemeToggle';

describe('MarketingThemeToggle', () => {
  it('advances light → dark on click', () => {
    mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme });

    render(<MarketingThemeToggle />);
    screen.getByRole('button', { name: 'Theme: Light' }).click();

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('advances dark → system on click', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme });

    render(<MarketingThemeToggle />);
    screen.getByRole('button', { name: 'Theme: Dark' }).click();

    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('advances system → light on click', () => {
    mockUseTheme.mockReturnValue({ theme: 'system', setTheme: mockSetTheme });

    render(<MarketingThemeToggle />);
    screen.getByRole('button', { name: 'Theme: System' }).click();

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
