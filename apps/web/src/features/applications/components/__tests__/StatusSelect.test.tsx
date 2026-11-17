import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListFilterIcon } from 'lucide-react';
import { StatusSelect } from '#/features/applications/components/StatusSelect';
import { STATUS_COLORS } from '#/features/applications/lib/statusColors';

const setup = (props: Partial<React.ComponentProps<typeof StatusSelect>> = {}) => {
  const onChange = vi.fn();
  render(
    <StatusSelect
      value=""
      onChange={onChange}
      label="Filter by status"
      placeholder="All statuses"
      {...props}
    />,
  );
  return { onChange, user: userEvent.setup() };
};

const openList = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Filter by status' }));
  return screen.getByRole('listbox');
};

describe('StatusSelect', () => {
  it('shows the placeholder when nothing is selected', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Filter by status' })).toHaveTextContent(
      'All statuses',
    );
  });

  it('shows the selected status as text, not colour alone', () => {
    setup({ value: 'interviewing' });
    expect(screen.getByRole('button', { name: 'Filter by status' })).toHaveTextContent(
      'Interviewing',
    );
  });

  it('is collapsed until opened', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Filter by status' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('lists every status plus the placeholder option', async () => {
    const { user } = setup();
    await openList(user);
    // 7 statuses + "All statuses"
    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it('marks the selected option with aria-selected', async () => {
    const { user } = setup({ value: 'applied' });
    await openList(user);
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Applied');
  });

  it('renders a colour swatch alongside each status label', async () => {
    const { user } = setup();
    const listbox = await openList(user);
    const dots = listbox.querySelectorAll('span[aria-hidden="true"]');
    // The swatch is decorative; the label carries the meaning.
    expect(dots.length).toBeGreaterThanOrEqual(8);
    expect(listbox.innerHTML).toContain(STATUS_COLORS.interviewing.dot);
    expect(listbox.innerHTML).toContain(STATUS_COLORS.offered.dot);
  });

  it('reports the chosen status', async () => {
    const { user, onChange } = setup();
    await openList(user);
    await user.click(screen.getByRole('option', { name: /Offered/ }));
    expect(onChange).toHaveBeenCalledWith('offered');
  });

  it('reports the empty value when the placeholder option is chosen', async () => {
    const { user, onChange } = setup({ value: 'applied' });
    await openList(user);
    await user.click(screen.getByRole('option', { name: /All statuses/ }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  describe('keyboard', () => {
    it('opens on ArrowDown and selects with Enter', async () => {
      const { user, onChange } = setup();
      screen.getByRole('button', { name: 'Filter by status' }).focus();

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // From the placeholder at index 0, one step down is 'draft'.
      await user.keyboard('{ArrowDown}{Enter}');
      expect(onChange).toHaveBeenCalledWith('draft');
    });

    it('walks the list with ArrowDown', async () => {
      const { user, onChange } = setup();
      screen.getByRole('button', { name: 'Filter by status' }).focus();
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');
      expect(onChange).toHaveBeenCalledWith('interviewing');
    });

    it('jumps to the last status with End', async () => {
      const { user, onChange } = setup();
      screen.getByRole('button', { name: 'Filter by status' }).focus();
      await user.keyboard('{ArrowDown}{End}{Enter}');
      expect(onChange).toHaveBeenCalledWith('withdrawn');
    });

    it('closes on Escape without selecting, and returns focus to the trigger', async () => {
      const { user, onChange } = setup();
      const trigger = screen.getByRole('button', { name: 'Filter by status' });
      trigger.focus();
      await user.keyboard('{ArrowDown}');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      expect(trigger).toHaveFocus();
    });

    it('does not move past the ends of the list', async () => {
      const { user, onChange } = setup();
      screen.getByRole('button', { name: 'Filter by status' }).focus();
      await user.keyboard('{ArrowDown}');
      // Already on the first option; ArrowUp must not wrap to the end.
      await user.keyboard('{ArrowUp}{ArrowUp}{Enter}');
      expect(onChange).toHaveBeenCalledWith('');
    });
  });

  it('cannot be opened while disabled', async () => {
    const { user } = setup({ disabled: true });
    await user.click(screen.getByRole('button', { name: 'Filter by status' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps showing the placeholder after a pick when resetAfterSelect is set', async () => {
    // The bulk bar's "Change status…" is an action menu, not a filter: it
    // should not start reading as though a status were selected.
    const { user } = setup({ resetAfterSelect: true, placeholder: 'Change status…' });
    await user.click(screen.getByRole('button', { name: 'Filter by status' }));
    await user.click(screen.getByRole('option', { name: /Accepted/ }));
    expect(screen.getByRole('button', { name: 'Filter by status' })).toHaveTextContent(
      'Change status…',
    );
  });

  describe('iconOnlyOnMobile (JEF-232)', () => {
    it('renders the mobile icon in place of the label below sm', () => {
      setup({ iconOnlyOnMobile: true, mobileIcon: <ListFilterIcon aria-hidden="true" /> });
      const trigger = screen.getByRole('button', { name: 'Filter by status' });
      // Both variants render; the sm breakpoint decides which one shows.
      expect(trigger.querySelector('span.sm\\:hidden')?.querySelector('svg')).not.toBeNull();
      expect(trigger.querySelector('span.sm\\:hidden')).toHaveTextContent('');
      expect(trigger).toHaveTextContent('All statuses');
    });

    it('shows the picked status as its colour dot beside the mobile icon', () => {
      setup({
        value: 'applied',
        iconOnlyOnMobile: true,
        mobileIcon: <ListFilterIcon aria-hidden="true" />,
      });
      const trigger = screen.getByRole('button', { name: 'Filter by status' });
      expect(trigger.querySelector('span.sm\\:hidden')!.innerHTML).toContain(
        STATUS_COLORS.applied.dot,
      );
    });

    it('opens the same listbox and reports the choice', async () => {
      const { user, onChange } = setup({
        iconOnlyOnMobile: true,
        mobileIcon: <ListFilterIcon aria-hidden="true" />,
      });
      await user.click(screen.getByRole('button', { name: 'Filter by status' }));
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      await user.click(screen.getByRole('option', { name: /Offered/ }));
      expect(onChange).toHaveBeenCalledWith('offered');
    });

    it('keeps the desktop label and chevron at sm and above', () => {
      setup({
        value: 'interviewing',
        iconOnlyOnMobile: true,
        mobileIcon: <ListFilterIcon aria-hidden="true" />,
      });
      const desktopSpan = screen
        .getByRole('button', { name: 'Filter by status' })
        .querySelector('span.sm\\:flex');
      expect(desktopSpan).toHaveTextContent('Interviewing');
      expect(desktopSpan!.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    });
  });
});
