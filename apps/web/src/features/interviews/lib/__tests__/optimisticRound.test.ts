import { describe, expect, it } from 'vitest';
import {
  OPTIMISTIC_ROUND_ID_PREFIX,
  buildOptimisticRound,
  isOptimisticRound,
} from '#/features/interviews/lib/optimisticRound';
import { emptyForm } from '#/features/interviews/lib/roundForm';

const now = new Date('2024-06-01T15:00:00.000Z');

describe('buildOptimisticRound', () => {
  it('shows what the form holds, with no questions yet', () => {
    const round = buildOptimisticRound(
      'app-1',
      {
        type: 'onsite',
        scheduledAt: '2024-06-02T10:00',
        interviewerName: 'Alex Kim',
        notes: 'Bring ID',
        outcome: 'passed',
      },
      now,
    );

    expect(round).toEqual({
      id: `${OPTIMISTIC_ROUND_ID_PREFIX}${now.getTime()}`,
      applicationId: 'app-1',
      type: 'onsite',
      scheduledAt: '2024-06-02T10:00',
      completedAt: null,
      interviewerName: 'Alex Kim',
      notes: 'Bring ID',
      outcome: 'passed',
      questionCount: 0,
      mockQuestionCount: 0,
      createdAt: '2024-06-01T15:00:00.000Z',
      updatedAt: '2024-06-01T15:00:00.000Z',
    });
  });

  it('turns blank text fields into null, as the server would store them', () => {
    const round = buildOptimisticRound('app-1', emptyForm(), now);

    expect(round).toMatchObject({ scheduledAt: null, interviewerName: null, notes: null });
  });

  it('is marked as not yet created', () => {
    expect(isOptimisticRound(buildOptimisticRound('app-1', emptyForm(), now))).toBe(true);
  });

  it('reads the clock when none is given', () => {
    const before = Date.now();
    const round = buildOptimisticRound('app-1', emptyForm());
    const after = Date.now();

    const stamp = Number(round.id.slice(OPTIMISTIC_ROUND_ID_PREFIX.length));
    expect(stamp).toBeGreaterThanOrEqual(before);
    expect(stamp).toBeLessThanOrEqual(after);
  });
});

describe('isOptimisticRound', () => {
  it('is false for a round the server created', () => {
    expect(isOptimisticRound({ id: 'V1StGXR8_Z5jdHi6B-myT' })).toBe(false);
  });
});
