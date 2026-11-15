import {
  job,
  school,
  skill,
  type GenerationFixture,
} from '#src/evals/fixtures/generationFixture.js';

/**
 * Three invented candidates for judging how good a resume is, not only whether
 * it is true (JEF-599). Each is hard in a way that separates a strong resume
 * from a weak one, and each `idealResume` is the strong one: aimed summary,
 * the posting's own terms, concrete bullets that keep their numbers, and the
 * best match first. They run as resume cases only; the cover-letter text is
 * there to satisfy the fixture type.
 */

/** A long, metric-rich history: the resume has to choose what leads, and keep every number. */
export const LONG_METRIC_RICH: GenerationFixture = {
  id: 'long-metric-rich',
  workExperiences: [
    job(
      'Orbit Logistics',
      'Staff Data Engineer',
      '2020-02-01',
      null,
      'Led the Kafka-based event platform: 40 services, 2 billion events a day. Cut warehouse spend by 31% ($1.2M a year) by moving batch jobs to Airflow on spot instances. Managed 6 engineers across two teams and ran hiring for 4 of them. Introduced data contracts that reduced pipeline incidents from 22 a quarter to 5.',
    ),
    job(
      'Pellucid Systems',
      'Senior Data Engineer',
      '2016-09-01',
      '2020-01-31',
      'Built the Airflow scheduler setup serving 300 DAGs. Migrated the Hadoop cluster to Snowflake, cutting report latency from 6 hours to 25 minutes. Mentored 3 junior engineers.',
    ),
    job(
      'Brightwave Media',
      'Data Engineer',
      '2013-06-01',
      '2016-08-31',
      'Wrote Python ETL for ad-impression data, 50 GB a day. Built the first dashboards in Tableau used by the sales team.',
    ),
  ],
  educations: [school('University of Warwick', 'BSc', 'Mathematics', '2009-09-01', '2013-06-30')],
  skills: [
    skill('Kafka', 'Streaming', 'Expert'),
    skill('Airflow', 'Orchestration', 'Expert'),
    skill('Python', 'Languages'),
    skill('SQL', 'Languages'),
    skill('Snowflake', 'Data'),
    skill('Terraform', 'Cloud'),
    skill('AWS', 'Cloud'),
    skill('People management', 'Leadership'),
  ],
  app: {
    company: 'Meridian Health',
    role: 'Engineering Manager, Data Platform',
    location: 'London',
    description:
      'Meridian Health is hiring an Engineering Manager, Data Platform. You will lead a team of 6 to 8 engineers running our streaming and batch data platform. Must have: Kafka at scale, Airflow, experience managing engineers and hiring, and a track record of cutting cost or incidents. Nice to have: Snowflake, Terraform, healthcare data.',
  },
  notes: [],
  idealResume: {
    summary:
      'Staff Data Engineer who manages six engineers across two teams on a Kafka and Airflow platform handling 2 billion events a day. Cut warehouse spend by 31% ($1.2M a year) and pipeline incidents from 22 to 5 a quarter.',
    experience: [
      {
        company: 'Orbit Logistics',
        title: 'Staff Data Engineer',
        period: 'Feb 2020 – Present',
        bullets: [
          'Managed 6 engineers across two teams and ran hiring for 4 of them.',
          'Led the Kafka event platform: 40 services and 2 billion events a day.',
          'Cut warehouse spend by 31% ($1.2M a year) by moving batch jobs to Airflow on spot instances.',
          'Introduced data contracts that reduced pipeline incidents from 22 a quarter to 5.',
        ],
      },
      {
        company: 'Pellucid Systems',
        title: 'Senior Data Engineer',
        period: 'Sep 2016 – Jan 2020',
        bullets: [
          'Built the Airflow scheduler setup serving 300 DAGs.',
          'Migrated the Hadoop cluster to Snowflake, cutting report latency from 6 hours to 25 minutes.',
          'Mentored 3 junior engineers.',
        ],
      },
      {
        company: 'Brightwave Media',
        title: 'Data Engineer',
        period: 'Jun 2013 – Aug 2016',
        bullets: ['Wrote Python ETL for ad-impression data, 50 GB a day.'],
      },
    ],
    education: [
      {
        institution: 'University of Warwick',
        qualification: 'BSc Mathematics',
        period: '2009 – 2013',
      },
    ],
    skills: [
      { category: 'Streaming and orchestration', items: ['Kafka', 'Airflow'] },
      { category: 'Cloud and data', items: ['Snowflake', 'Terraform', 'AWS'] },
      { category: 'Languages', items: ['Python', 'SQL'] },
      { category: 'Leadership', items: ['People management'] },
    ],
  },
  idealCoverLetter: `Dear Hiring Team,

I am applying for the Engineering Manager, Data Platform role at Meridian Health. At Orbit Logistics I manage six engineers across two teams on a Kafka platform that handles 2 billion events a day, and I cut warehouse spend by 31%.

Kind regards`,
};

/** A posting that says PostgreSQL, Kubernetes and JavaScript where the candidate wrote Postgres, K8s and JS. */
export const POSTING_SYNONYMS: GenerationFixture = {
  id: 'posting-synonyms',
  workExperiences: [
    job(
      'Tidewater Software',
      'Backend Developer',
      '2019-04-01',
      null,
      'Built the orders API in Node on Postgres, serving 1.5 million requests a day. Ran the K8s cluster for 12 services and set up CI/CD that cut deploy time from 40 minutes to 8. Wrote JS tooling for the support team.',
    ),
    job(
      'Foxglove Labs',
      'Junior Developer',
      '2017-01-01',
      '2019-03-31',
      'Maintained a Rails app on Postgres. Wrote integration tests, raising coverage from 40% to 75%.',
    ),
  ],
  educations: [
    school('University of Manchester', 'BSc', 'Software Engineering', '2013-09-01', '2016-06-30'),
  ],
  skills: [
    skill('Postgres', 'Databases'),
    skill('K8s', 'Infrastructure'),
    skill('JS', 'Languages'),
    skill('Node', 'Languages'),
    skill('CI/CD', 'Infrastructure'),
    skill('Ruby', 'Languages'),
  ],
  app: {
    company: 'Kestrel Retail',
    role: 'Backend Engineer',
    location: 'Manchester',
    description:
      'Kestrel Retail needs a Backend Engineer with strong PostgreSQL, Kubernetes, JavaScript or TypeScript and continuous integration experience. You will own services that handle millions of requests a day.',
  },
  notes: [],
  idealResume: {
    summary:
      'Backend engineer building JavaScript services on PostgreSQL and Kubernetes, with continuous integration that cut deploys from 40 minutes to 8. Owns an orders API serving 1.5 million requests a day.',
    experience: [
      {
        company: 'Tidewater Software',
        title: 'Backend Developer',
        period: 'Apr 2019 – Present',
        bullets: [
          'Built the orders API in Node on PostgreSQL, serving 1.5 million requests a day.',
          'Ran the Kubernetes cluster for 12 services.',
          'Set up continuous integration that cut deploy time from 40 minutes to 8.',
          'Wrote JavaScript tooling for the support team.',
        ],
      },
      {
        company: 'Foxglove Labs',
        title: 'Junior Developer',
        period: 'Jan 2017 – Mar 2019',
        bullets: [
          'Maintained a Rails app on PostgreSQL.',
          'Wrote integration tests, raising coverage from 40% to 75%.',
        ],
      },
    ],
    education: [
      {
        institution: 'University of Manchester',
        qualification: 'BSc Software Engineering',
        period: '2013 – 2016',
      },
    ],
    skills: [
      { category: 'Databases', items: ['PostgreSQL'] },
      { category: 'Infrastructure', items: ['Kubernetes', 'CI/CD'] },
      { category: 'Languages', items: ['JavaScript', 'Node', 'Ruby'] },
    ],
  },
  idealCoverLetter: `Dear Hiring Team,

I am applying for the Backend Engineer role at Kestrel Retail. At Tidewater Software I built an orders API on PostgreSQL that serves 1.5 million requests a day and run the Kubernetes cluster behind it.

Kind regards`,
};

/** A teacher moving into customer success: most roles are unrelated, a few bullets transfer. */
export const CAREER_CHANGER: GenerationFixture = {
  id: 'career-changer',
  workExperiences: [
    job(
      'Ashgrove Secondary School',
      'Science Teacher',
      '2015-09-01',
      '2024-07-31',
      'Taught chemistry and physics to 150 students a year. Led the school parent communication programme, running 3 parent evenings a term. Raised average exam results by 12% over four years. Trained 5 new teachers.',
    ),
    job(
      'Cityside Volunteers',
      'Volunteer Coordinator',
      '2022-01-01',
      '2024-06-30',
      'Managed volunteer records in Salesforce for 400 volunteers. Onboarded 60 new volunteers each year.',
    ),
    job(
      'Harbour Pub',
      'Bartender',
      '2013-06-01',
      '2015-08-31',
      'Served up to 200 customers a night.',
    ),
  ],
  educations: [
    school('University of Bristol', 'BSc', 'Chemistry', '2010-09-01', '2013-06-30'),
    school('UCL', 'PGCE', 'Secondary Education', '2014-09-01', '2015-06-30'),
  ],
  skills: [
    skill('Salesforce', 'Tools'),
    skill('Communication', 'General'),
    skill('Training', 'General'),
    skill('Presentations', 'General'),
    skill('Excel', 'Tools'),
  ],
  app: {
    company: 'Beacon CRM',
    role: 'Customer Success Manager',
    location: 'Remote',
    description:
      'Beacon CRM is hiring a Customer Success Manager to own a portfolio of 40 small-business customers from onboarding to renewal. Must have: customer onboarding experience, clear communication with stakeholders, CRM experience (Salesforce or similar), a retention or renewal mindset and data-driven reporting. Teaching, support and account roles are welcome.',
  },
  notes: [],
  idealResume: {
    summary:
      'Former science teacher moving into customer success. Onboarded 60 new volunteers a year, kept records for 400 volunteers in Salesforce, and ran 3 parent evenings a term to keep families informed.',
    experience: [
      {
        company: 'Ashgrove Secondary School',
        title: 'Science Teacher',
        period: 'Sep 2015 – Jul 2024',
        bullets: [
          'Led the parent communication programme, running 3 parent evenings a term.',
          'Raised average exam results by 12% over four years, tracking progress for 150 students a year.',
          'Trained 5 new teachers.',
        ],
      },
      {
        company: 'Cityside Volunteers',
        title: 'Volunteer Coordinator',
        period: 'Jan 2022 – Jun 2024',
        bullets: [
          'Onboarded 60 new volunteers each year.',
          'Managed volunteer records in Salesforce for 400 volunteers.',
        ],
      },
    ],
    education: [
      {
        institution: 'University of Bristol',
        qualification: 'BSc Chemistry',
        period: '2010 – 2013',
      },
      { institution: 'UCL', qualification: 'PGCE Secondary Education', period: '2014 – 2015' },
    ],
    skills: [
      { category: 'Tools', items: ['Salesforce', 'Excel'] },
      { category: 'General', items: ['Communication', 'Training', 'Presentations'] },
    ],
  },
  idealCoverLetter: `Dear Hiring Team,

I am applying for the Customer Success Manager role at Beacon CRM. As a Volunteer Coordinator I onboarded 60 new volunteers a year and kept records for 400 volunteers in Salesforce, and as a teacher I ran 3 parent evenings a term.

Kind regards`,
};

/** The fixtures that run as resume cases only, to be judged for quality (JEF-599). */
export const RESUME_QUALITY_FIXTURES: GenerationFixture[] = [
  LONG_METRIC_RICH,
  POSTING_SYNONYMS,
  CAREER_CHANGER,
];
