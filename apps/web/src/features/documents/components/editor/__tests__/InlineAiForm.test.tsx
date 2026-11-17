import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('#/features/ai/hooks/useAiCredits', () => ({
  useAiCredits: () => ({
    needsSetup: false,
    onTrakwynAi: false,
    canAfford: () => true,
    costOf: () => 2,
    view: null,
    refresh: vi.fn(),
  }),
}));

import { InlineAiForm } from '#/features/documents/components/editor/InlineAiForm';
import { INLINE_AI_CUSTOM_MAX_CHARS } from '#/features/documents/lib/editor/aiActions';

const runButton = () => screen.getByRole('button', { name: 'Ask' });
const askInput = () => screen.getByRole('textbox');

describe('InlineAiForm custom instruction (JEF-620)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps Run off while the instruction is empty or blank', async () => {
    render(<InlineAiForm canRun onRun={vi.fn()} />);
    expect(runButton()).toBeDisabled();

    await userEvent.type(askInput(), '   ');
    expect(runButton()).toBeDisabled();
  });

  it('caps the instruction at the maximum length', () => {
    render(<InlineAiForm canRun onRun={vi.fn()} />);
    expect(askInput()).toHaveAttribute('maxlength', String(INLINE_AI_CUSTOM_MAX_CHARS));
  });

  it('runs the instruction on submit and on Enter', async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<InlineAiForm canRun onRun={onRun} />);

    await userEvent.type(askInput(), 'Make it shorter{Enter}');

    await waitFor(() =>
      expect(onRun).toHaveBeenCalledWith({ kind: 'custom', text: 'Make it shorter' }),
    );
  });

  it('runs once on a double click while the run is pending', async () => {
    let finish: () => void = () => undefined;
    const onRun = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<InlineAiForm canRun onRun={onRun} />);

    await userEvent.type(askInput(), 'Tighten');
    await userEvent.dblClick(runButton());

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(runButton()).toBeDisabled();
    finish();
    await waitFor(() => expect(runButton()).toBeEnabled());
  });

  it('does not run anything when the actions cannot run', async () => {
    const onRun = vi.fn();
    render(<InlineAiForm canRun={false} hint="Select some text first" onRun={onRun} />);

    expect(askInput()).toBeDisabled();
    expect(runButton()).toBeDisabled();
    expect(screen.getByText('Select some text first')).toBeInTheDocument();
    expect(onRun).not.toHaveBeenCalled();
  });
});
