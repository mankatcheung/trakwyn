import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ProfileStep } from '#/features/onboarding/components/welcome/ProfileStep';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('#/features/profile/components/sections/WorkExperienceSection', () => ({
  WorkExperienceSection: () => <section data-testid="work-experience" />,
}));
vi.mock('#/features/profile/components/sections/SkillsSection', () => ({
  SkillsSection: () => <section data-testid="skills" />,
}));

describe('ProfileStep', () => {
  it('hints at what to add and links to the full profile', () => {
    render(<ProfileStep />);

    expect(screen.getByText(/A good start is your current role/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the full profile' })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('keeps its content when it renders again', () => {
    const { rerender } = render(<ProfileStep />);

    rerender(<ProfileStep />);

    expect(screen.getByRole('link', { name: 'Open the full profile' })).toBeInTheDocument();
    expect(screen.getAllByTestId('skills')).toHaveLength(1);
  });

  it("is the profile page's own work and skills sections", () => {
    render(<ProfileStep />);

    expect(screen.getByTestId('work-experience')).toBeInTheDocument();
    expect(screen.getByTestId('skills')).toBeInTheDocument();
  });
});
