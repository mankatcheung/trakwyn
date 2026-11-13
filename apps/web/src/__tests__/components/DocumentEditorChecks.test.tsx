import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  CHECKS_DEBOUNCE_MS,
  DocumentEditorChecks,
} from '#/routes/_authenticated/applications/$applicationId/-components/DocumentEditorChecks';

const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (text: string) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const json = (...content: unknown[]) => JSON.stringify({ type: 'doc', content });

const WITH_TABLE = json(
  para('a@b.co'),
  heading('Experience'),
  { type: 'table', content: [] },
  para(words(200)),
);
const CLEAN = json(para('a@b.co'), heading('Experience'), para(words(200)));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DocumentEditorChecks', () => {
  it('shows a count badge and, once opened, the table hint', () => {
    render(<DocumentEditorChecks contentJson={WITH_TABLE} />);
    expect(screen.getByText('1 to review')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/has a table/i)).toBeInTheDocument();
  });

  it('shows a calm message and no badge when nothing is wrong', () => {
    render(<DocumentEditorChecks contentJson={CLEAN} />);
    expect(screen.queryByText(/to review/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/no issues found/i)).toBeInTheDocument();
  });

  it('updates after a pause, and clears the table hint when the table is removed', () => {
    const { rerender } = render(<DocumentEditorChecks contentJson={WITH_TABLE} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    rerender(<DocumentEditorChecks contentJson={CLEAN} />);
    // Still the old answer: typing has not paused yet.
    expect(screen.getByText(/has a table/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(CHECKS_DEBOUNCE_MS);
    });
    expect(screen.queryByText(/has a table/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no issues found/i)).toBeInTheDocument();
  });

  it('jumps to the block a hint is about', () => {
    const onJump = vi.fn();
    render(<DocumentEditorChecks contentJson={WITH_TABLE} onJump={onJump} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: /go to/i }));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it('offers no jump for a hint about the whole document', () => {
    render(<DocumentEditorChecks contentJson={json(para(words(300)))} onJump={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/no headings/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /go to/i })).not.toBeInTheDocument();
  });

  it('does not throw on broken JSON', () => {
    render(<DocumentEditorChecks contentJson="{nope" />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText(/no issues found/i)).toBeInTheDocument();
  });
});
