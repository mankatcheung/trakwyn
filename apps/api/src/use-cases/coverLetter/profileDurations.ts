import type { UserProfile } from '#src/use-cases/shared/userProfile.js';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

interface DatedEntry {
  startDate: Date;
  endDate: Date | null;
}

const yearsBetween = (from: Date, to: Date): number =>
  Math.max(0, (to.getTime() - from.getTime()) / MS_PER_YEAR);

/**
 * Whole-year durations the profile's dates support (JEF-558). A letter that
 * says "four years as a receptionist" for a Feb 2019 to May 2023 job has done
 * arithmetic, not invented a number, so those are allowed alongside the
 * numbers the user typed. For each job and each course, for all jobs added
 * together, and for the span from the first start to the last end, both the
 * rounded-down and the rounded year count.
 */
export function profileDurationsInYears(
  profile: Pick<UserProfile, 'workExperiences' | 'educations'>,
  now: Date,
): number[] {
  const durations = new Set<number>();
  const add = (years: number) => {
    // A week of slack, so a job of exactly two calendar years (1.9986 of a
    // 365.25-day year) is still two.
    for (const whole of [Math.floor(years + 7 / 365.25), Math.round(years)]) {
      if (whole > 0) durations.add(whole);
    }
  };
  const lengthOf = (entry: DatedEntry) => yearsBetween(entry.startDate, entry.endDate ?? now);

  const jobs: DatedEntry[] = profile.workExperiences;
  for (const entry of [...jobs, ...profile.educations]) add(lengthOf(entry));

  if (jobs.length > 1) {
    add(jobs.reduce((sum, job) => sum + lengthOf(job), 0));
    const first = Math.min(...jobs.map((job) => job.startDate.getTime()));
    const last = Math.max(...jobs.map((job) => (job.endDate ?? now).getTime()));
    add(yearsBetween(new Date(first), new Date(last)));
  }
  return [...durations].sort((a, b) => a - b);
}
