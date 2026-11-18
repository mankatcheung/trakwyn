import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DraftTitleField } from '#/features/documents/components/DraftTitleField';

function setup(onCommit = vi.fn().mockResolvedValue(true), title = 'My resume') {
  const view = render(<DraftTitleField title={title} placeholder="Resume" onCommit={onCommit} />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  return { input, onCommit, ...view };
}

describe('DraftTitleField', () => {
  it('shows the saved title, with the draft type as the placeholder', () => {
    const { input } = setup();

    expect(input).toHaveValue('My resume');
    expect(input).toHaveAttribute('placeholder', 'Resume');
    expect(input).toHaveAttribute('maxlength', '200');
  });

  it('saves the trimmed title on blur', async () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: '  Backend resume  ' } });
    fireEvent.blur(input);

    await waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith('Backend resume'));
  });

  it('saves on Enter by leaving the field', async () => {
    const { input, onCommit } = setup();
    input.focus();

    fireEvent.change(input, { target: { value: 'Backend resume' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onCommit).toHaveBeenCalledExactlyOnceWith('Backend resume'));
  });

  it('saves nothing for an empty title and puts the old one back', () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('My resume');
  });

  it('saves nothing for an unchanged title', () => {
    const { input, onCommit } = setup();

    fireEvent.change(input, { target: { value: 'My resume ' } });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('throws away the edit on Escape', () => {
    const { input, onCommit } = setup();
    input.focus();

    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('My resume');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('goes back to the saved title when the save fails', async () => {
    const onCommit = vi.fn().mockResolvedValue(false);
    const { input } = setup(onCommit);

    fireEvent.change(input, { target: { value: 'Backend resume' } });
    fireEvent.blur(input);

    await waitFor(() => expect(input).toHaveValue('My resume'));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it('shows the new title once the page has stored it', async () => {
    const onCommit = vi.fn().mockResolvedValue(true);
    const { input, rerender } = setup(onCommit);

    fireEvent.change(input, { target: { value: 'Backend resume' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    rerender(<DraftTitleField title="Backend resume" placeholder="Resume" onCommit={onCommit} />);

    expect(input).toHaveValue('Backend resume');
  });
});
