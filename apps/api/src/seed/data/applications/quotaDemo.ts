import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type { SeedApplication, SeedContact, SeedInterviewRound, SeedOffer } from '../../types.js';

/**
 * Two applications that sit at the content caps (JEF-339), so the quota hints
 * (JEF-494) have something to show without clicking a hundred times. Counts
 * come from `CONTENT_LIMITS`, so they follow the limits when those change.
 *
 * - "Nearly full" holds 80% of every cap: the "N of M" hint appears but nothing is blocked.
 * - "At the limit" holds exactly the cap: every Add control is disabled.
 */

const dayMs = 86_400_000;
const NEARLY_FULL = 0.8;

const upTo = (limit: number, fraction: number) => Math.ceil(limit * fraction);
const range = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

const notes = (count: number) => range(count).map((n) => ({ content: `Quota demo note ${n}.` }));

const contacts = (count: number): SeedContact[] =>
  range(count).map((n) => ({
    name: `Contact ${n}`,
    role: 'Recruiter',
    email: `contact${n}@quota-demo.example.com`,
  }));

const rounds = (count: number): SeedInterviewRound[] =>
  range(count).map((n) => ({
    type: 'phone',
    scheduledAt: new Date(Date.now() - (count - n + 1) * dayMs),
    completedAt: new Date(Date.now() - (count - n + 1) * dayMs),
    interviewerName: `Interviewer ${n}`,
    outcome: 'passed',
  }));

const offers = (count: number): SeedOffer[] =>
  range(count).map((n) => ({
    baseSalary: 150_000 + n * 1_000,
    bonus: null,
    equity: null,
    benefits: null,
    costOfLivingAdjustment: null,
    currency: 'USD',
    period: 'yearly',
    notes: `Quota demo offer ${n}.`,
  }));

const tags = (count: number) => range(count).map((n) => `quota-${n}`);

function quotaApplication(
  company: string,
  role: string,
  fraction: number,
  limits = CONTENT_LIMITS,
): SeedApplication {
  return {
    company,
    role,
    status: 'applied',
    jobUrl: null,
    location: 'Remote',
    salaryRange: null,
    description: 'Seeded at the content caps to show the quota hints. Safe to delete.',
    appliedAt: new Date(Date.now() - 2 * dayMs),
    starred: false,
    source: 'Seed',
    tags: tags(upTo(limits.TAGS_PER_APPLICATION, fraction)),
    notes: notes(upTo(limits.NOTES_PER_APPLICATION, fraction)),
    contacts: contacts(upTo(limits.CONTACTS_PER_APPLICATION, fraction)),
    interviewRounds: rounds(upTo(limits.INTERVIEW_ROUNDS_PER_APPLICATION, fraction)),
    offers: offers(upTo(limits.OFFERS_PER_APPLICATION, fraction)),
  };
}

export const quotaDemoApplications: SeedApplication[] = [
  quotaApplication('Quota Demo — Nearly full', 'Staff Engineer', NEARLY_FULL),
  quotaApplication('Quota Demo — At the limit', 'Principal Engineer', 1),
];
