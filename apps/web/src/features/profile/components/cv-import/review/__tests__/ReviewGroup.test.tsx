import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ReviewGroup } from '#/features/profile/components/cv-import/review/ReviewGroup';
import type { Draft } from '#/features/profile/lib/cvImportDrafts';

interface Item {
  name: string;
}

const draft = (id: string, name: string, overrides: Partial<Draft<Item>> = {}): Draft<Item> => ({
  id,
  selected: true,
  alreadyInProfile: false,
  value: { name },
  ...overrides,
});

function setup(
  drafts: Draft<Item>[],
  props: { disabled?: boolean; isValid?: (v: Item) => boolean } = {},
) {
  const onChange = vi.fn();
  const view = render(
    <ReviewGroup<Item>
      id="things"
      title="Things"
      icon={<span data-testid="icon" />}
      drafts={drafts}
      disabled={props.disabled ?? false}
      onChange={onChange}
      labelOf={(v) => v.name}
      isValid={props.isValid ?? ((v) => v.name !== '')}
      summary={(v): ReactNode => <p>summary:{v.name}</p>}
      fields={(v, update): ReactNode => (
        <input
          aria-label="name field"
          value={v.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      )}
    />,
  );
  return { onChange, ...view };
}

describe('ReviewGroup', () => {
  it('renders nothing when the CV had none of this kind', () => {
    const { container } = setup([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('titles the section and counts what is ticked', () => {
    setup([draft('a', 'One'), draft('b', 'Two', { selected: false })]);

    expect(screen.getByRole('region', { name: /Things/ })).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('shows each row as a summary with an include box named for it', () => {
    setup([draft('a', 'One'), draft('b', 'Two', { selected: false })]);

    expect(screen.getByText('summary:One')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Include One' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Include Two' })).not.toBeChecked();
  });

  it('ticks and unticks a row, leaving the others as they were', () => {
    const rows = [draft('a', 'One'), draft('b', 'Two', { selected: false })];
    const { onChange } = setup(rows);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Two' }));

    const next = onChange.mock.calls[0][0] as Draft<Item>[];
    expect(next.map((d) => d.selected)).toEqual([true, true]);
    expect(rows[1].selected).toBe(false);
  });

  it('selects none when all are ticked, and all when some are not', () => {
    const all = setup([draft('a', 'One'), draft('b', 'Two')]);
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect((all.onChange.mock.calls[0][0] as Draft<Item>[]).map((d) => d.selected)).toEqual([
      false,
      false,
    ]);
    all.unmount();

    const some = setup([draft('a', 'One'), draft('b', 'Two', { selected: false })]);
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect((some.onChange.mock.calls[0][0] as Draft<Item>[]).map((d) => d.selected)).toEqual([
      true,
      true,
    ]);
  });

  it('flags a ticked row that is not valid, but not an unticked one', () => {
    setup([draft('a', ''), draft('b', '', { selected: false })], {});

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveClass('border-red-300');
    expect(rows[1]).not.toHaveClass('border-red-300');
    expect(rows[1]).toHaveClass('opacity-70');
    expect(rows[0]).not.toHaveClass('opacity-70');
  });

  it('badges a row that is already in the profile', () => {
    setup([draft('a', 'One', { alreadyInProfile: true }), draft('b', 'Two')]);

    expect(screen.getAllByText('Already in your profile')).toHaveLength(1);
  });

  it('swaps a row between summary and fields from its edit button, and back', () => {
    setup([draft('a', 'One')]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: 'name field' })).toHaveValue('One');
    expect(screen.queryByText('summary:One')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('summary:One')).toBeInTheDocument();
  });

  it('writes an edit into that row only', () => {
    const { onChange } = setup([draft('a', 'One'), draft('b', 'Two')]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByRole('textbox', { name: 'name field' }), {
      target: { value: 'Uno' },
    });

    const next = onChange.mock.calls[0][0] as Draft<Item>[];
    expect(next.map((d) => d.value.name)).toEqual(['Uno', 'Two']);
  });

  it('locks every control while the import is saving', () => {
    setup([draft('a', 'One')], { disabled: true });

    expect(screen.getByRole('button', { name: 'Select none' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Include One' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
  });
});
