import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockSetLocale } = vi.hoisted(() => ({
  mockSetLocale: vi.fn(),
}));

vi.mock('#/lib/i18n', () => ({
  LOCALE_OPTIONS: [
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
  ],
  useLocale: () => ({
    locale: 'en',
    setLocale: mockSetLocale,
    t: (key: string) => ({ 'settings.language': 'Language' })[key] ?? key,
  }),
}));

import { MarketingLocalePicker } from '#/features/marketing/components/MarketingLocalePicker';

const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Language' }));
  return screen.getByRole('listbox');
};

describe('MarketingLocalePicker', () => {
  beforeEach(() => {
    mockSetLocale.mockClear();
  });

  it('is a single icon button until opened — no always-visible select pill', () => {
    render(<MarketingLocalePicker />);

    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens a popup listing every supported locale, current one selected', async () => {
    const user = userEvent.setup();
    render(<MarketingLocalePicker />);
    await openList(user);

    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: '简体中文' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls setLocale with the newly picked value and closes the popup', async () => {
    const user = userEvent.setup();
    render(<MarketingLocalePicker />);
    await openList(user);

    await user.click(screen.getByRole('option', { name: '简体中文' }));

    expect(mockSetLocale).toHaveBeenCalledWith('zh-CN');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes without picking when clicking outside the popup', async () => {
    const user = userEvent.setup();
    render(<MarketingLocalePicker />);
    await openList(user);

    await user.click(document.body);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  describe('keyboard', () => {
    it('opens on ArrowDown and picks with Enter', async () => {
      const user = userEvent.setup();
      render(<MarketingLocalePicker />);
      const trigger = screen.getByRole('button', { name: 'Language' });
      trigger.focus();

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Opens on the current selection (en, index 0); one step down is zh-CN.
      await user.keyboard('{ArrowDown}{Enter}');
      expect(mockSetLocale).toHaveBeenCalledWith('zh-CN');
      expect(trigger).toHaveFocus();
    });

    it('closes on Escape without selecting', async () => {
      const user = userEvent.setup();
      render(<MarketingLocalePicker />);
      const trigger = screen.getByRole('button', { name: 'Language' });
      trigger.focus();

      await user.keyboard('{ArrowDown}{Escape}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(mockSetLocale).not.toHaveBeenCalled();
      expect(trigger).toHaveFocus();
    });
  });
});
