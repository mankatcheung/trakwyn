import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReviewDates } from '#/features/profile/hooks/useReviewDates';

vi.mock('#/lib/i18n', () => ({
  useLocale: () => ({
    t: (key: string) => (key === 'experience.present' ? 'Present' : key),
    formatDate: (value: Date, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', options).format(value),
  }),
}));

describe('useReviewDates', () => {
  const dates = () => renderHook(() => useReviewDates()).result.current;

  describe('month', () => {
    it('formats a YYYY-MM value as a short month and year', () => {
      expect(dates().month('2024-03')).toBe('Mar 2024');
      expect(dates().month('2019-12')).toBe('Dec 2019');
    });

    it('does not shift the month across a timezone boundary', () => {
      expect(dates().month('2024-01')).toBe('Jan 2024');
    });

    it.each(['', '2024', '2024-13', '2024-00', '03/2024', 'Mar 2024', '2024-3'])(
      'returns %j as typed when it is not YYYY-MM',
      (value) => {
        expect(dates().month(value)).toBe(value);
      },
    );
  });

  describe('range', () => {
    it('joins start and end with an en dash', () => {
      expect(dates().range('2020-01', '2022-06')).toBe('Jan 2020 – Jun 2022');
    });

    it('shows "Present" for an open end date', () => {
      expect(dates().range('2020-01', '')).toBe('Jan 2020 – Present');
    });

    it('passes through an unparseable start', () => {
      expect(dates().range('soon', '2022-06')).toBe('soon – Jun 2022');
    });
  });
});
