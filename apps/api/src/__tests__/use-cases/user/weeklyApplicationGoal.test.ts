import { describe, expect, it } from 'vitest';
import { getWeeklyApplicationGoalStats } from '#src/use-cases/user/weeklyApplicationGoal.js';
import { makeApplication } from '#src/__tests__/helpers/mocks/jobs.js';

const now = new Date('2026-08-12T12:00:00Z');
const week = 7 * 24 * 60 * 60 * 1000;

describe('weeklyApplicationGoal', () => {
  it('counts the current week and completed-week streak', () => {
    const apps = [
      makeApplication({ createdAt: new Date('2026-08-10T10:00:00Z') }),
      makeApplication({ createdAt: new Date('2026-08-11T10:00:00Z') }),
      makeApplication({ createdAt: new Date(now.getTime() - week) }),
      makeApplication({ createdAt: new Date(now.getTime() - week - 1) }),
    ];

    expect(getWeeklyApplicationGoalStats(apps, 2, now)).toMatchObject({
      weeklyApplicationGoal: 2,
      currentWeekCount: 2,
      streakWeeks: 2,
    });
  });

  it('does not break a streak while the current week is still in progress', () => {
    const apps = [
      makeApplication({ createdAt: new Date(now.getTime() - week) }),
      makeApplication({ createdAt: new Date(now.getTime() - week - 1) }),
    ];

    expect(getWeeklyApplicationGoalStats(apps, 2, now).streakWeeks).toBe(1);
  });
});
