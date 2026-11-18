import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WelcomeStepFrame } from '#/features/onboarding/components/welcome/WelcomeStepFrame';

function setup(props: Partial<Parameters<typeof WelcomeStepFrame>[0]> = {}) {
  const onPrimary = vi.fn();
  const view = render(
    <WelcomeStepFrame
      stepNumber={2}
      totalSteps={4}
      title="Pick your goals"
      primaryLabel="Continue"
      onPrimary={onPrimary}
      {...props}
    />,
  );
  return { onPrimary, ...view };
}

describe('WelcomeStepFrame', () => {
  it('shows the progress, the heading and the primary action', () => {
    const { onPrimary } = setup();

    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { hidden: true })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByRole('heading', { name: 'Pick your goals' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it('shows a description and a body only when given them', () => {
    const { rerender, onPrimary } = setup();
    expect(screen.queryByText('Why we ask')).not.toBeInTheDocument();
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();

    rerender(
      <WelcomeStepFrame
        stepNumber={2}
        totalSteps={4}
        title="Pick your goals"
        description="Why we ask"
        primaryLabel="Continue"
        onPrimary={onPrimary}
      >
        <div data-testid="body" />
      </WelcomeStepFrame>,
    );

    expect(screen.getByText('Why we ask')).toBeInTheDocument();
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('offers back, skip step and skip setup only when the step has them', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip this step' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip setup' })).not.toBeInTheDocument();
  });

  it('runs back, skip step and skip setup', () => {
    const onBack = vi.fn();
    const onSkipStep = vi.fn();
    const onSkipSetup = vi.fn();
    setup({ onBack, onSkipStep, onSkipSetup });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip this step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onSkipStep).toHaveBeenCalledOnce();
    expect(onSkipSetup).toHaveBeenCalledOnce();
  });

  it('disables every action while the answer is saving', () => {
    setup({ busy: true, onBack: () => {}, onSkipStep: () => {}, onSkipSetup: () => {} });

    for (const name of ['Continue', 'Back', 'Skip this step', 'Skip setup']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('moves focus to the heading as each step arrives', () => {
    const { rerender, onPrimary } = setup();
    expect(screen.getByRole('heading', { name: 'Pick your goals' })).toHaveFocus();

    screen.getByRole('button', { name: 'Continue' }).focus();
    rerender(
      <WelcomeStepFrame
        stepNumber={3}
        totalSteps={4}
        title="Add a key"
        primaryLabel="Continue"
        onPrimary={onPrimary}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Add a key' })).toHaveFocus();
  });
});
