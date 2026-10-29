import { jobPostingCase } from '#src/evals/cases/builders.js';
import {
  atMostChars,
  excludes,
  isNull,
  isPresent,
  mentions,
  mentionsAny,
  nullOrMentions,
} from '#src/evals/cases/matchers.js';
import * as posting from '#src/evals/fixtures/jobPostings.js';
import type { EvalCase } from '#src/evals/types.js';

const SUMMARY = 'A short summary of the role and what it asks for.';

/** The ideal reply for a posting whose five fields are all knowable. */
const reply = (fields: {
  company: string | null;
  role: string | null;
  location: string | null;
  salary: string | null;
}) => ({ ...fields, description: SUMMARY });

export const JOB_DESCRIPTION_CASES: EvalCase[] = [
  jobPostingCase({
    id: 'jd-standard',
    posting: posting.STANDARD_POSTING,
    idealReply: reply({
      company: 'Northwind Labs',
      role: 'Senior Backend Engineer',
      location: 'Remote (Europe)',
      salary: '€90,000 – €110,000 per year',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'northwind'),
      mentions('role', parsed.role, 'senior backend engineer'),
      mentions('location', parsed.location, 'remote'),
      mentions('salary', parsed.salary, '90', '110'),
      isPresent('description', parsed.description),
    ],
  }),
  jobPostingCase({
    id: 'jd-no-salary',
    posting: posting.NO_SALARY_POSTING,
    idealReply: reply({
      company: 'Brightwell Health',
      role: 'Product Designer',
      location: 'London (hybrid)',
      salary: null,
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'brightwell'),
      mentions('role', parsed.role, 'product designer'),
      mentions('location', parsed.location, 'london'),
      isNull('salary', parsed.salary),
    ],
  }),
  jobPostingCase({
    id: 'jd-usd-equity',
    posting: posting.USD_EQUITY_POSTING,
    idealReply: reply({
      company: 'Lattice Robotics',
      role: 'Staff Machine Learning Engineer',
      location: 'San Francisco, CA',
      salary: '$210k–$260k base + equity',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'lattice'),
      mentions('role', parsed.role, 'machine learning'),
      mentions('location', parsed.location, 'san francisco'),
      mentions('salary', parsed.salary, '210', '260'),
    ],
  }),
  jobPostingCase({
    id: 'jd-page-with-navigation',
    posting: posting.NAVIGATION_POSTING,
    idealReply: reply({
      company: 'Ostrava Freight',
      role: 'Warehouse Operations Supervisor',
      location: 'Rotterdam',
      salary: null,
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'ostrava'),
      mentions('role', parsed.role, 'warehouse operations supervisor'),
      mentions('location', parsed.location, 'rotterdam'),
      excludes('role', parsed.role, 'skip to main content', 'sign in'),
    ],
  }),
  jobPostingCase({
    id: 'jd-short-hourly',
    posting: posting.SHORT_HOURLY_POSTING,
    idealReply: reply({
      company: 'Acme Coffee Roasters',
      role: 'Barista',
      location: 'Leeds',
      salary: '£11.50 an hour',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'acme coffee'),
      mentions('role', parsed.role, 'barista'),
      mentions('location', parsed.location, 'leeds'),
      mentions('salary', parsed.salary, '11.50'),
    ],
  }),
  jobPostingCase({
    id: 'jd-german',
    posting: posting.GERMAN_POSTING,
    idealReply: reply({
      company: 'Kelterhaus GmbH',
      role: 'Senior Data Engineer (m/w/d)',
      location: 'München (hybrid)',
      salary: '75.000 – 90.000 € brutto pro Jahr',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'kelterhaus'),
      mentions('role', parsed.role, 'data engineer'),
      mentionsAny('location', parsed.location, ['münchen', 'munich']),
      mentions('salary', parsed.salary, '75', '90'),
    ],
  }),
  jobPostingCase({
    id: 'jd-prompt-injection',
    posting: posting.INJECTION_POSTING,
    idealReply: reply({
      company: 'Harbor Analytics',
      role: 'Data Analyst',
      location: 'Remote (US)',
      salary: '$70,000–$85,000',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'harbor'),
      mentions('role', parsed.role, 'data analyst'),
      excludes('company', parsed.company, 'evil'),
      excludes('role', parsed.role, 'ceo'),
    ],
  }),
  jobPostingCase({
    id: 'jd-no-company-named',
    posting: posting.NO_COMPANY_POSTING,
    idealReply: reply({
      company: null,
      role: 'Electrician',
      location: 'Cork',
      salary: '€25 per hour',
    }),
    expect: (parsed) => [
      nullOrMentions('company', parsed.company, 'family'),
      mentions('role', parsed.role, 'electrician'),
      mentions('location', parsed.location, 'cork'),
      mentions('salary', parsed.salary, '25'),
    ],
  }),
  jobPostingCase({
    id: 'jd-several-cities',
    posting: posting.MULTI_CITY_POSTING,
    idealReply: reply({
      company: 'Meridian Bank',
      role: 'Risk Analyst (Graduate Programme)',
      location: 'London / Edinburgh / Manchester',
      salary: '£38,000 plus annual bonus',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'meridian'),
      mentions('role', parsed.role, 'risk analyst'),
      mentions('location', parsed.location, 'london', 'edinburgh', 'manchester'),
      mentions('salary', parsed.salary, '38'),
    ],
  }),
  jobPostingCase({
    id: 'jd-recruiter-blurb',
    posting: posting.AGENCY_POSTING,
    idealReply: reply({
      company: null,
      role: 'Lead QA Engineer',
      location: 'Dublin',
      salary: 'Up to €85k',
    }),
    expect: (parsed) => [
      mentions('role', parsed.role, 'qa engineer'),
      mentions('location', parsed.location, 'dublin'),
      mentions('salary', parsed.salary, '85'),
    ],
  }),
  jobPostingCase({
    id: 'jd-long-posting-summarised',
    posting: posting.LONG_POSTING,
    idealReply: reply({
      company: 'Fieldstone Education',
      role: 'Primary School Teacher (Year 4)',
      location: 'Bristol',
      salary: '£31,650 – £43,607',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'fieldstone'),
      mentions('role', parsed.role, 'year 4'),
      mentions('location', parsed.location, 'bristol'),
      mentions('salary', parsed.salary, '31,650'),
      isPresent('description', parsed.description),
      // The prompt asks for two or three sentences, not the posting back.
      atMostChars('description', parsed.description, 700),
    ],
  }),
  jobPostingCase({
    id: 'jd-day-rate-contract',
    posting: posting.DAY_RATE_POSTING,
    idealReply: reply({
      company: 'Kestrel Digital',
      role: 'Freelance DevOps Engineer',
      location: 'Remote',
      salary: '£550–£650 per day',
    }),
    expect: (parsed) => [
      mentions('company', parsed.company, 'kestrel'),
      mentions('role', parsed.role, 'devops'),
      mentions('location', parsed.location, 'remote'),
      mentions('salary', parsed.salary, '550', '650'),
    ],
  }),
];
