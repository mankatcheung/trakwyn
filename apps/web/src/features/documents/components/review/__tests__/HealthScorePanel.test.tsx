import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  HealthScorePanel,
  scoreColor,
  SCORE_COLORS,
} from '#/features/documents/components/review/HealthScorePanel';

const healthScore = {
  score: 78,
  label: 'On track',
  criteria: [
    { key: 'has_notes', label: 'Has notes', points: 20, earned: 20, met: true },
    { key: 'has_contact', label: 'Has a contact', points: 10, earned: 0, met: false },
  ],
};

describe('scoreColor', () => {
  it('maps score ranges to the expected color bucket', () => {
    expect(scoreColor(95)).toBe('green');
    expect(scoreColor(80)).toBe('blue');
    expect(scoreColor(50)).toBe('amber');
    expect(scoreColor(10)).toBe('red');
  });
});

describe('HealthScorePanel', () => {
  it('renders the score and label on one line, with criteria collapsed by default', () => {
    const { container } = render(<HealthScorePanel healthScore={healthScore} />);

    // The 52px progress ring became a label, a verdict and a bar (JEF-208).
    expect(screen.getByText('On track · 78')).toBeInTheDocument();
    expect(screen.getByText('Application health')).toBeInTheDocument();
    expect(screen.queryByText('Has notes')).not.toBeInTheDocument();

    const bar = container.querySelector('[style*="width: 78%"]');
    expect(bar).not.toBeNull();
  });

  it('reports its expanded state to assistive technology', () => {
    render(<HealthScorePanel healthScore={healthScore} />);

    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('expands to show criteria when clicked', () => {
    render(<HealthScorePanel healthScore={healthScore} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Has notes')).toBeInTheDocument();
    expect(screen.getByText('Has a contact')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();
  });

  it('collapses again on a second click', () => {
    render(<HealthScorePanel healthScore={healthScore} />);

    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    expect(screen.getByText('Has notes')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText('Has notes')).not.toBeInTheDocument();
  });

  it('exposes a color bucket for every scoreColor key', () => {
    expect(Object.keys(SCORE_COLORS)).toEqual(
      expect.arrayContaining(['green', 'blue', 'amber', 'red']),
    );
  });
});
