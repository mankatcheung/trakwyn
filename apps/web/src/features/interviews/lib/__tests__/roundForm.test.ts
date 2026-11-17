import { describe, expect, it } from 'vitest';
import type { InterviewRound } from '#/features/interviews/graphql/interviewRoundQueries';
import {
  ROUND_OUTCOMES,
  ROUND_TYPES,
  emptyForm,
  roundSchema,
  roundToForm,
} from '#/features/interviews/lib/roundForm';

const round: InterviewRound = {
  id: 'round-1',
  applicationId: 'app-1',
  type: 'onsite',
  scheduledAt: '2024-06-01T15:00:00.000Z',
  completedAt: null,
  interviewerName: 'Alex Kim',
  notes: 'Discuss system design',
  outcome: 'passed',
  questionCount: 0,
  mockQuestionCount: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('emptyForm', () => {
  it('starts a pending phone round with nothing typed', () => {
    expect(emptyForm()).toEqual({
      type: 'phone',
      scheduledAt: '',
      interviewerName: '',
      notes: '',
      outcome: 'pending',
    });
  });

  it('hands out a fresh object each time', () => {
    expect(emptyForm()).not.toBe(emptyForm());
  });

  it('starts on values the selects offer', () => {
    const form = emptyForm();

    expect(ROUND_TYPES).toContain(form.type);
    expect(ROUND_OUTCOMES).toContain(form.outcome);
  });
});

describe('roundToForm', () => {
  it('fills the form from a round, cutting the time to what a datetime-local input takes', () => {
    expect(roundToForm(round)).toEqual({
      type: 'onsite',
      scheduledAt: '2024-06-01T15:00',
      interviewerName: 'Alex Kim',
      notes: 'Discuss system design',
      outcome: 'passed',
    });
  });

  it('turns missing optional fields into empty strings', () => {
    expect(
      roundToForm({ ...round, scheduledAt: null, interviewerName: null, notes: null }),
    ).toMatchObject({ scheduledAt: '', interviewerName: '', notes: '' });
  });
});

describe('roundSchema', () => {
  it('accepts a complete form', () => {
    expect(roundSchema.safeParse(emptyForm()).success).toBe(true);
  });

  it('rejects a form with a missing field', () => {
    const withoutNotes = {
      type: 'phone',
      scheduledAt: '',
      interviewerName: '',
      outcome: 'pending',
    };

    expect(roundSchema.safeParse(withoutNotes).success).toBe(false);
  });
});
