import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateFields, Field, MonthField } from '../ReviewFields';

const isInvalid = (el: HTMLElement) => el.getAttribute('aria-invalid') === 'true';

describe('Field', () => {
  it('ties its label to the input it renders', () => {
    render(<Field label="Company">{(id) => <input id={id} />}</Field>);
    expect(screen.getByLabelText('Company')).toBeInTheDocument();
  });

  it('gives two fields different ids', () => {
    render(
      <>
        <Field label="A">{(id) => <input id={id} />}</Field>
        <Field label="B">{(id) => <input id={id} />}</Field>
      </>,
    );
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});

describe('MonthField', () => {
  it('shows the value and reports edits', () => {
    const onChange = vi.fn();
    render(<MonthField label="Issued" value="2024-03" onChange={onChange} />);
    const input = screen.getByLabelText('Issued');
    expect(input).toHaveValue('2024-03');
    fireEvent.change(input, { target: { value: '2025-01' } });
    expect(onChange).toHaveBeenCalledWith('2025-01');
  });

  it('accepts a blank month and a valid one', () => {
    const { rerender } = render(<MonthField label="M" value="" onChange={vi.fn()} />);
    expect(isInvalid(screen.getByLabelText('M'))).toBe(false);
    rerender(<MonthField label="M" value="2024-12" onChange={vi.fn()} />);
    expect(isInvalid(screen.getByLabelText('M'))).toBe(false);
  });

  it('flags a value that is not a month, and an explicit invalid flag', () => {
    const { rerender } = render(<MonthField label="M" value="2024-13" onChange={vi.fn()} />);
    expect(isInvalid(screen.getByLabelText('M'))).toBe(true);
    rerender(<MonthField label="M" value="2024-01" invalid onChange={vi.fn()} />);
    expect(isInvalid(screen.getByLabelText('M'))).toBe(true);
  });
});

describe('DateFields', () => {
  function setup(start: string, end: string) {
    const onChange = vi.fn();
    render(
      <DateFields start={start} end={end} hint="Leave blank if current" onChange={onChange} />,
    );
    const [startInput, endInput] = screen.getAllByDisplayValue(/.*/) as HTMLInputElement[];
    return { onChange, startInput: startInput!, endInput: endInput! };
  }

  it('shows both dates and the hint under the end date', () => {
    const { startInput, endInput } = setup('2020-01', '2021-06');
    expect(startInput).toHaveValue('2020-01');
    expect(endInput).toHaveValue('2021-06');
    expect(screen.getByText('Leave blank if current')).toBeInTheDocument();
  });

  it('reports a start or end edit as a patch of only that field', () => {
    const { onChange, startInput, endInput } = setup('2020-01', '');
    fireEvent.change(startInput, { target: { value: '2019-05' } });
    expect(onChange).toHaveBeenLastCalledWith({ startDate: '2019-05' });
    fireEvent.change(endInput, { target: { value: '2022-02' } });
    expect(onChange).toHaveBeenLastCalledWith({ endDate: '2022-02' });
  });

  it('requires a valid start, but lets the end be blank', () => {
    const blankEnd = setup('2020-01', '');
    expect(isInvalid(blankEnd.startInput)).toBe(false);
    expect(isInvalid(blankEnd.endInput)).toBe(false);
  });

  it('flags a missing start, a malformed end, and an end before the start', () => {
    document.body.innerHTML = '';
    expect(isInvalid(setup('', '').startInput)).toBe(true);
    document.body.innerHTML = '';
    expect(isInvalid(setup('2020-01', '2020-13').endInput)).toBe(true);
    document.body.innerHTML = '';
    expect(isInvalid(setup('2020-06', '2020-01').endInput)).toBe(true);
  });

  it('keeps the output for the same props and follows changed ones on a re-render', () => {
    const onChange = vi.fn();
    const ui = (start: string, end: string) => (
      <>
        <MonthField label="M" value={start} onChange={onChange} />
        <DateFields start={start} end={end} hint="h" onChange={onChange} />
      </>
    );
    const { container, rerender } = render(ui('2020-01', '2021-01'));
    const before = container.innerHTML;
    rerender(ui('2020-01', '2021-01'));
    expect(container.innerHTML).toBe(before);
    rerender(ui('2020-05', ''));
    expect(container.innerHTML).not.toBe(before);
  });
});
