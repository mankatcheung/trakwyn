import { claimSource, renderResume } from '#src/evals/fixtures/generationFixture.js';
import { BACKEND_MISSING_SKILLS } from '#src/evals/fixtures/profiles.js';
import {
  CAREER_CHANGER,
  LONG_METRIC_RICH,
  POSTING_SYNONYMS,
} from '#src/evals/fixtures/qualityProfiles.js';
import type { GenerationFixture } from '#src/evals/fixtures/generationFixture.js';
import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';

/**
 * Pairs of resumes for one candidate and posting that a person ranked by hand
 * (JEF-599): the same facts, one written well and one written badly. The
 * quality judge must score the strong one higher before its numbers on real
 * generations count, as `validateJudge` does for the claim check.
 *
 * Both resumes are true: the weak one invents nothing, it is just worse, in
 * one named way. What "better" means is `QUALITY_RULE`; change the rule and
 * these pairs together.
 */
export interface LabelledQualityPair {
  id: string;
  source: string;
  strong: string;
  weak: string;
  /** The weak resume as data, so a test can check it invents nothing. */
  weakResume: ResumeContent;
  /** What is wrong with the weak one, for the validation report. */
  weakness: string;
}

const pair = (
  fixture: GenerationFixture,
  kind: string,
  weakness: string,
  weak: ResumeContent,
): LabelledQualityPair => ({
  id: `${fixture.id}-${kind}`,
  source: claimSource(fixture),
  strong: renderResume(fixture.idealResume),
  weak: renderResume(weak),
  weakResume: weak,
  weakness,
});

const role = (
  company: string,
  title: string,
  period: string,
  bullets: string[],
): ResumeContent['experience'][number] => ({ company, title, period, bullets });

export const LABELLED_QUALITY_PAIRS: readonly LabelledQualityPair[] = [
  pair(BACKEND_MISSING_SKILLS, 'vague', 'generic summary, vague bullets, every number dropped', {
    summary: 'Reliable engineer who works hard, learns fast and enjoys solving problems.',
    experience: [
      role('Lumen Freight', 'Senior Software Engineer', 'Mar 2021 – Present', [
        'Worked on APIs.',
        'Helped lead other engineers.',
        'Worked on making things faster.',
      ]),
      role('Harbor Analytics', 'Software Engineer', 'Jun 2017 – Feb 2021', [
        'Worked on data pipelines.',
      ]),
    ],
    education: BACKEND_MISSING_SKILLS.idealResume.education,
    skills: [{ category: 'Skills', items: ['AWS', 'Python', 'PostgreSQL', 'TypeScript'] }],
  }),
  pair(
    BACKEND_MISSING_SKILLS,
    'omits-leadership',
    'leaves out the team leadership the posting asks for, and the numbers',
    {
      summary: 'Software engineer with a degree in Computer Science.',
      experience: [
        role('Harbor Analytics', 'Software Engineer', 'Jun 2017 – Feb 2021', [
          'Wrote ETL pipelines in Python for retail analytics clients.',
        ]),
        role('Lumen Freight', 'Senior Software Engineer', 'Mar 2021 – Present', [
          'Built shipment-tracking APIs.',
        ]),
      ],
      education: BACKEND_MISSING_SKILLS.idealResume.education,
      skills: [{ category: 'Languages', items: ['Python'] }],
    },
  ),

  pair(LONG_METRIC_RICH, 'vague', 'generic summary, vague bullets, every number and tool dropped', {
    summary:
      'Experienced professional with a passion for data and technology. A hard worker and strong team player.',
    experience: [
      role('Orbit Logistics', 'Staff Data Engineer', 'Feb 2020 – Present', [
        'Responsible for the event platform.',
        'Worked with a team of engineers.',
        'Helped reduce costs.',
        'Involved in improving data quality.',
      ]),
      role('Pellucid Systems', 'Senior Data Engineer', 'Sep 2016 – Jan 2020', [
        'Worked on scheduling and a data migration.',
        'Helped junior engineers.',
      ]),
      role('Brightwave Media', 'Data Engineer', 'Jun 2013 – Aug 2016', [
        'Worked on ETL and dashboards.',
      ]),
    ],
    education: LONG_METRIC_RICH.idealResume.education,
    skills: [
      {
        category: 'Skills',
        items: [
          'Snowflake',
          'SQL',
          'Python',
          'Kafka',
          'Airflow',
          'Terraform',
          'AWS',
          'People management',
        ],
      },
    ],
  }),
  pair(
    LONG_METRIC_RICH,
    'omits-must-haves',
    'leaves out Kafka, Airflow, hiring and the cost and incident results the posting asks for',
    {
      summary: 'Data engineer with a degree in Mathematics.',
      experience: [
        role('Brightwave Media', 'Data Engineer', 'Jun 2013 – Aug 2016', [
          'Wrote Python ETL for ad-impression data, 50 GB a day.',
          'Built the first dashboards in Tableau used by the sales team.',
        ]),
        role('Orbit Logistics', 'Staff Data Engineer', 'Feb 2020 – Present', [
          'Managed 6 engineers across two teams.',
        ]),
      ],
      education: LONG_METRIC_RICH.idealResume.education,
      skills: [{ category: 'Languages', items: ['Python', 'SQL'] }],
    },
  ),
  pair(
    LONG_METRIC_RICH,
    'wrong-aim',
    'summary aimed at a different role, numbers dropped from the roles that matter',
    {
      summary: 'Analyst who enjoys building dashboards and looks forward to working with data.',
      experience: [
        role('Brightwave Media', 'Data Engineer', 'Jun 2013 – Aug 2016', [
          'Wrote Python ETL for ad-impression data, 50 GB a day.',
          'Built the first dashboards in Tableau used by the sales team.',
        ]),
        role('Pellucid Systems', 'Senior Data Engineer', 'Sep 2016 – Jan 2020', [
          'Mentored junior engineers.',
          'Worked on the move from Hadoop to Snowflake.',
        ]),
        role('Orbit Logistics', 'Staff Data Engineer', 'Feb 2020 – Present', [
          'Led the Kafka event platform.',
          'Managed engineers.',
        ]),
      ],
      education: LONG_METRIC_RICH.idealResume.education,
      skills: [{ category: 'Tools', items: ['Python', 'SQL', 'AWS', 'Snowflake'] }],
    },
  ),

  pair(POSTING_SYNONYMS, 'vague', 'generic summary, vague bullets, numbers dropped', {
    summary: 'Motivated developer who is eager to learn and enjoys working in a team.',
    experience: [
      role('Tidewater Software', 'Backend Developer', 'Apr 2019 – Present', [
        'Worked on an API and some infrastructure.',
        'Helped with deployments.',
        'Wrote some tooling.',
      ]),
      role('Foxglove Labs', 'Junior Developer', 'Jan 2017 – Mar 2019', [
        'Worked on a web app and wrote tests.',
      ]),
    ],
    education: POSTING_SYNONYMS.idealResume.education,
    skills: [{ category: 'Skills', items: ['Ruby', 'Node', 'CI/CD', 'JS', 'K8s', 'Postgres'] }],
  }),
  pair(
    POSTING_SYNONYMS,
    'keeps-own-terms',
    'keeps Postgres, K8s and JS where the posting says PostgreSQL, Kubernetes and JavaScript',
    {
      summary:
        'Backend developer working with Postgres, K8s and JS, with CI/CD that cut deploys from 40 minutes to 8.',
      experience: [
        role('Tidewater Software', 'Backend Developer', 'Apr 2019 – Present', [
          'Built the orders API in Node on Postgres, serving 1.5 million requests a day.',
          'Ran the K8s cluster for 12 services.',
          'Set up CI/CD that cut deploy time from 40 minutes to 8.',
          'Wrote JS tooling for the support team.',
        ]),
        role('Foxglove Labs', 'Junior Developer', 'Jan 2017 – Mar 2019', [
          'Maintained a Rails app on Postgres.',
          'Wrote integration tests, raising coverage from 40% to 75%.',
        ]),
      ],
      education: POSTING_SYNONYMS.idealResume.education,
      skills: [
        { category: 'Databases', items: ['Postgres'] },
        { category: 'Infrastructure', items: ['K8s', 'CI/CD'] },
        { category: 'Languages', items: ['JS', 'Node', 'Ruby'] },
      ],
    },
  ),
  pair(
    POSTING_SYNONYMS,
    'omits-must-haves',
    'leaves out Kubernetes, continuous integration and the request volume the posting asks for',
    {
      summary: 'Developer with a degree in Software Engineering.',
      experience: [
        role('Foxglove Labs', 'Junior Developer', 'Jan 2017 – Mar 2019', [
          'Maintained a Rails app.',
          'Wrote integration tests.',
        ]),
        role('Tidewater Software', 'Backend Developer', 'Apr 2019 – Present', [
          'Wrote JS tooling for the support team.',
        ]),
      ],
      education: POSTING_SYNONYMS.idealResume.education,
      skills: [{ category: 'Languages', items: ['Ruby', 'JS'] }],
    },
  ),

  pair(CAREER_CHANGER, 'vague', 'generic summary, vague duties, every number dropped', {
    summary:
      'Hardworking professional with a passion for helping people, looking for a new challenge.',
    experience: [
      role('Ashgrove Secondary School', 'Science Teacher', 'Sep 2015 – Jul 2024', [
        'Responsible for teaching science.',
        'Worked with parents.',
        'Helped students improve.',
      ]),
      role('Cityside Volunteers', 'Volunteer Coordinator', 'Jan 2022 – Jun 2024', [
        'Worked with volunteers and records.',
      ]),
    ],
    education: CAREER_CHANGER.idealResume.education,
    skills: [
      {
        category: 'Skills',
        items: ['Communication', 'Excel', 'Presentations', 'Salesforce', 'Training'],
      },
    ],
  }),
  pair(
    CAREER_CHANGER,
    'omits-must-haves',
    'lists teaching duties and a bar job, and leaves out the onboarding and Salesforce work the posting asks for',
    {
      summary:
        'Chemistry graduate and qualified teacher with experience in education and hospitality.',
      experience: [
        role('Harbour Pub', 'Bartender', 'Jun 2013 – Aug 2015', [
          'Served up to 200 customers a night.',
        ]),
        role('Ashgrove Secondary School', 'Science Teacher', 'Sep 2015 – Jul 2024', [
          'Taught chemistry and physics to 150 students a year.',
          'Trained 5 new teachers.',
        ]),
      ],
      education: CAREER_CHANGER.idealResume.education,
      skills: [{ category: 'General', items: ['Excel', 'Presentations'] }],
    },
  ),
  pair(
    CAREER_CHANGER,
    'buried',
    'the relevant volunteer role is last and stripped of its numbers, under an unrelated summary',
    {
      summary: 'Science teacher with nine years of classroom experience.',
      experience: [
        role('Ashgrove Secondary School', 'Science Teacher', 'Sep 2015 – Jul 2024', [
          'Taught chemistry and physics to 150 students a year.',
          'Raised average exam results by 12% over four years.',
          'Trained 5 new teachers.',
          'Led the parent communication programme.',
        ]),
        role('Harbour Pub', 'Bartender', 'Jun 2013 – Aug 2015', [
          'Served up to 200 customers a night.',
        ]),
        role('Cityside Volunteers', 'Volunteer Coordinator', 'Jan 2022 – Jun 2024', [
          'Onboarded volunteers.',
          'Used Salesforce.',
        ]),
      ],
      education: CAREER_CHANGER.idealResume.education,
      skills: [
        {
          category: 'General',
          items: ['Training', 'Presentations', 'Communication', 'Excel', 'Salesforce'],
        },
      ],
    },
  ),
];
