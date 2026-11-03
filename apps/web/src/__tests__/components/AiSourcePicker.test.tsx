import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import en from '#/i18n/en.json';

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({ t: (key: string) => (en as Record<string, string>)[key] ?? key }),
}));

import { AiSourcePicker } from '#/routes/_authenticated/settings/-components/AiSourcePicker';

describe('AiSourcePicker', () => {
  it('checks the current source and reports a change', async () => {
    const onChange = vi.fn();
    render(<AiSourcePicker value="auto" hasOwnKey onChange={onChange} />);

    expect(screen.getByLabelText(/Automatic/)).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /^Trakwyn AI/ }));
    expect(onChange).toHaveBeenCalledWith('trakwyn');
  });

  it('disables "My own key" and says why when there is no key', () => {
    render(<AiSourcePicker value="auto" hasOwnKey={false} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/My own key/)).toBeDisabled();
    expect(screen.getByText('Add an API key below to use this option.')).toBeInTheDocument();
  });
});
