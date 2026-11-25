import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDates } from '#/hooks/useDates';

describe('useDates (JEF-693)', () => {
  it('formats in the UI language, English without a provider', () => {
    const { result } = renderHook(() => useDates());
    const date = new Date(2020, 2, 3, 19, 3, 41);

    expect(result.current.day(date)).toBe('Mar 3, 2020');
    expect(result.current.dateTime(date)).toBe('Mar 3, 2020, 7:03 PM');
    expect(result.current.time(date)).toBe('7:03 PM');
  });

  it('gives an empty string for a missing date', () => {
    const { result } = renderHook(() => useDates());

    expect(result.current.day(null)).toBe('');
  });
});
