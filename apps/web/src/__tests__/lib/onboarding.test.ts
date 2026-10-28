import { describe, it, expect } from 'vitest';
import {
  finishDestination,
  hasAiGoal,
  needsWelcome,
  welcomeSteps,
  type OnboardingState,
} from '#/lib/onboarding';

const notOnboarded: OnboardingState = { onboardingCompletedAt: null, onboardingGoals: [] };
const onboarded: OnboardingState = {
  onboardingCompletedAt: '2026-10-01T00:00:00.000Z',
  onboardingGoals: [],
};

describe('onboarding (JEF-460)', () => {
  describe('needsWelcome', () => {
    it('sends someone who has not finished the flow there from an ordinary page', () => {
      expect(needsWelcome(notOnboarded, '/dashboard')).toBe(true);
      expect(needsWelcome(notOnboarded, '/applications/abc')).toBe(true);
    });

    it('never sends someone who has finished or skipped it', () => {
      expect(needsWelcome(onboarded, '/dashboard')).toBe(false);
    });

    it('lets them in when the check could not be made', () => {
      expect(needsWelcome(null, '/dashboard')).toBe(false);
    });

    it.each(['/welcome', '/profile', '/settings', '/settings/ai', '/oauth/consent'])(
      'leaves %s alone',
      (pathname) => {
        expect(needsWelcome(notOnboarded, pathname)).toBe(false);
      },
    );

    it('matches whole path segments only', () => {
      expect(needsWelcome(notOnboarded, '/profiles')).toBe(true);
    });
  });

  describe('welcomeSteps', () => {
    it('is welcome, goals and finish without an AI goal', () => {
      expect(welcomeSteps([])).toEqual(['intro', 'goals', 'finish']);
      expect(welcomeSteps(['TRACK_APPLICATIONS', 'MCP'])).toEqual(['intro', 'goals', 'finish']);
    });

    it.each([['AI_DOCUMENTS'], ['ASSISTANT']] as const)(
      'adds the profile and key steps for %s',
      (goal) => {
        expect(welcomeSteps([goal])).toEqual(['intro', 'goals', 'profile', 'aiKey', 'finish']);
      },
    );
  });

  it('hasAiGoal is true only for resumes and cover letters, or the assistant', () => {
    expect(hasAiGoal(['AI_DOCUMENTS'])).toBe(true);
    expect(hasAiGoal(['MCP', 'ASSISTANT'])).toBe(true);
    expect(hasAiGoal(['TRACK_APPLICATIONS', 'MCP'])).toBe(false);
    expect(hasAiGoal([])).toBe(false);
  });

  describe('finishDestination', () => {
    it('goes to a new application when tracking is the only goal', () => {
      expect(finishDestination(['TRACK_APPLICATIONS'])).toBe('/applications/new');
    });

    it('goes to the dashboard otherwise', () => {
      expect(finishDestination([])).toBe('/dashboard');
      expect(finishDestination(['TRACK_APPLICATIONS', 'MCP'])).toBe('/dashboard');
      expect(finishDestination(['ASSISTANT'])).toBe('/dashboard');
    });
  });
});
