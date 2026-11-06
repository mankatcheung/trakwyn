import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

const ai = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  refresh: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock('#/components/ai/hooks/useAiCredits', () => ({ useAiCredits: () => ai.value }));
vi.mock('#/components/AiCreditsMeter', () => ({
  AiCreditsMeter: ({ variant }: { variant: string }) => <div data-testid={`meter-${variant}`} />,
}));

import { AiCreditCost } from '#/components/ai/AiCreditCost';
import { AiPromptInput } from '#/components/ai/AiPromptInput';
import { AiActionBar } from '#/components/ai/AiActionBar';

const setAi = (over: Record<string, unknown> = {}) => {
  ai.value = {
    onTrakwynAi: true,
    needsSetup: false,
    canAfford: () => true,
    costOf: () => 3,
    refresh: ai.refresh,
    ...over,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  setAi();
});

describe('AiCreditCost', () => {
  it('says what the action costs', () => {
    render(<AiCreditCost feature="coverLetter" />);
    expect(screen.getByText('Uses 3 credits')).toBeInTheDocument();
  });

  it('uses the singular for one credit', () => {
    setAi({ costOf: () => 1 });
    render(<AiCreditCost feature="polishDraft" />);
    expect(screen.getByText('Uses 1 credit')).toBeInTheDocument();
  });

  it('renders nothing for a user on their own key', () => {
    setAi({ onTrakwynAi: false });
    const { container } = render(<AiCreditCost feature="coverLetter" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the cost is unknown', () => {
    setAi({ costOf: () => null });
    const { container } = render(<AiCreditCost feature="coverLetter" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AiPromptInput', () => {
  function Harness({ initial = '' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <AiPromptInput
        value={value}
        onChange={setValue}
        maxLength={10}
        placeholderExamples={['Shorter please']}
      />
    );
  }

  it('shows the character count and an example as the placeholder', () => {
    render(<Harness initial="abc" />);
    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Shorter please')).toBeInTheDocument();
  });

  it('reports typing', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/instructions/i), { target: { value: 'hello' } });
    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('never holds more than the limit', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/instructions/i), {
      target: { value: 'x'.repeat(25) },
    });
    expect(screen.getByText('10/10')).toBeInTheDocument();
  });
});

describe('AiActionBar', () => {
  const renderBar = (props = {}) =>
    render(
      <AiActionBar feature="coverLetter" label="Generate" onRun={vi.fn()} {...props}>
        <div>prompt slot</div>
      </AiActionBar>,
    );

  it('shows the prompt slot, the cost and the inline meter for Trakwyn AI', () => {
    renderBar();
    expect(screen.getByText('prompt slot')).toBeInTheDocument();
    expect(screen.getByText('Uses 3 credits')).toBeInTheDocument();
    expect(screen.getByTestId('meter-inline')).toBeInTheDocument();
  });

  it('shows no credits at all on an own key', () => {
    setAi({ onTrakwynAi: false });
    renderBar();
    expect(screen.queryByText(/credits/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('meter-inline')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  it('runs the action and then refreshes the credits', async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    renderBar({ onRun });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(ai.refresh).toHaveBeenCalled());
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('refreshes the credits even when the run fails', async () => {
    const onRun = vi.fn().mockRejectedValue(new Error('boom'));
    renderBar({ onRun });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(ai.refresh).toHaveBeenCalled());
  });

  it('disables the button and links to Settings → AI when credits are spent', () => {
    setAi({ canAfford: () => false });
    renderBar();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/out of ai credits/i);
    expect(screen.getByRole('link', { name: /add your own key/i })).toHaveAttribute(
      'href',
      '/settings/ai',
    );
  });

  it('offers to set up AI instead of the button when none is configured', () => {
    setAi({ needsSetup: true, onTrakwynAi: false });
    renderBar();
    expect(screen.queryByRole('button', { name: 'Generate' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set up AI' })).toHaveAttribute('href', '/settings/ai');
  });

  it('shows the loading label and blocks a second click while running', () => {
    renderBar({ loading: true, loadingLabel: 'Writing…' });
    expect(screen.getByRole('button', { name: 'Writing…' })).toBeDisabled();
  });
});
