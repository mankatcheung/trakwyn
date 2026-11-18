import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { GoalsStep } from '#/features/onboarding/components/welcome/GoalsStep';
import type { OnboardingGoal } from '#/features/onboarding/lib/onboarding';

function setup(goals: OnboardingGoal[] = []) {
  const onChange = vi.fn();
  render(<GoalsStep goals={goals} onChange={onChange} />);
  return onChange;
}

describe('GoalsStep', () => {
  it('lists the four goals under the question, none ticked to begin with', () => {
    setup();

    expect(screen.getByRole('group', { name: 'What do you want help with?' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
  });

  it('ticks the goals it is given', () => {
    setup(['AI_DOCUMENTS', 'MCP']);

    expect(screen.getByRole('checkbox', { name: /Write resumes/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Use Trakwyn from my AI tools/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Track my applications/ })).not.toBeChecked();
  });

  it('adds a goal in display order, whatever order they were ticked in', () => {
    const onChange = setup(['MCP']);

    fireEvent.click(screen.getByRole('checkbox', { name: /Track my applications/ }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['TRACK_APPLICATIONS', 'MCP']);
  });

  it('removes a goal and keeps the others', () => {
    const onChange = setup(['TRACK_APPLICATIONS', 'ASSISTANT']);

    fireEvent.click(screen.getByRole('checkbox', { name: /Ask the assistant/ }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['TRACK_APPLICATIONS']);
  });

  it('follows the goals it is given as they change', () => {
    const onChange = vi.fn();
    const { rerender } = render(<GoalsStep goals={['MCP']} onChange={onChange} />);
    rerender(<GoalsStep goals={['MCP']} onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: /Use Trakwyn/ })).toBeChecked();

    rerender(<GoalsStep goals={['ASSISTANT']} onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: /Use Trakwyn/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Ask the assistant/ })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: /Use Trakwyn/ }));
    expect(onChange).toHaveBeenLastCalledWith(['ASSISTANT', 'MCP']);
  });

  it('relabels the goals when the language changes', async () => {
    render(<GoalsStep goals={[]} onChange={() => {}} />);
    i18next.addResourceBundle('en-GB', 'translation', {
      'welcome.goalTrackTitle': 'Follow my applications',
    });

    await act(async () => {
      await i18next.changeLanguage('en-GB');
    });
    expect(screen.getByRole('checkbox', { name: /Follow my applications/ })).toBeInTheDocument();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    expect(screen.getByRole('checkbox', { name: /Track my applications/ })).toBeInTheDocument();
  });

  it('reports to the handler it was last given', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<GoalsStep goals={['MCP']} onChange={first} />);

    rerender(<GoalsStep goals={['MCP']} onChange={second} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Ask the assistant/ }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(['ASSISTANT', 'MCP']);
  });

  it('highlights the goals that are ticked', () => {
    setup(['ASSISTANT']);

    const label = screen.getByRole('checkbox', { name: /Ask the assistant/ }).closest('label');
    expect(label).toHaveClass('border-blue-500');
    expect(
      screen.getByRole('checkbox', { name: /Track my applications/ }).closest('label'),
    ).not.toHaveClass('border-blue-500');
  });
});
