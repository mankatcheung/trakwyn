import { describe, it, expect } from 'vitest';
import { profileDurationsInYears } from '#src/use-cases/coverLetter/profileDurations.js';

const entry = (start: string, end: string | null) => ({
  startDate: new Date(start),
  endDate: end ? new Date(end) : null,
});
const NOW = new Date('2026-11-12');

describe('profileDurationsInYears', () => {
  it('has nothing for an empty profile', () => {
    expect(profileDurationsInYears({ workExperiences: [], educations: [] }, NOW)).toEqual([]);
  });

  it('gives the rounded-down and the rounded years of one job', () => {
    // Feb 2019 to end of May 2023: 4.3 years.
    const durations = profileDurationsInYears(
      { workExperiences: [entry('2019-02-01', '2023-05-31')] as never, educations: [] },
      NOW,
    );
    expect(durations).toEqual([4]);
  });

  it('counts a job with no end date up to now', () => {
    const durations = profileDurationsInYears(
      { workExperiences: [entry('2021-03-01', null)] as never, educations: [] },
      NOW,
    );
    expect(durations).toEqual([5, 6]);
  });

  it('adds the jobs together and spans the first start to the last end', () => {
    const durations = profileDurationsInYears(
      {
        workExperiences: [
          entry('2010-01-01', '2012-01-01'),
          entry('2020-01-01', '2024-01-01'),
        ] as never,
        educations: [],
      },
      NOW,
    );
    // 2, 4, their sum 6, and the 14-year span.
    expect(durations).toEqual([2, 4, 6, 14]);
  });

  it('includes the length of a course', () => {
    const durations = profileDurationsInYears(
      { workExperiences: [], educations: [entry('2017-09-01', '2019-06-30')] as never },
      NOW,
    );
    expect(durations).toEqual([1, 2]);
  });

  it('never goes below zero for an end before a start', () => {
    expect(
      profileDurationsInYears(
        { workExperiences: [entry('2024-01-01', '2020-01-01')] as never, educations: [] },
        NOW,
      ),
    ).toEqual([]);
  });
});
