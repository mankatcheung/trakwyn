import type { ResumeContent } from '#src/domain/resume/ResumeContent.js';
import type { SeedResume } from '../types.js';

export const DEMO_CONTACT = ['Demo User', 'demo@example.com', '+1 212 555 0142'];

/** What the resume generator produces: structured, and with no contact lines. */
export const GENERATED_RESUME: ResumeContent = {
  summary:
    'Product-minded engineer with seven years building web applications, from design systems to realtime collaboration.',
  experience: [
    {
      company: 'Brightline Software',
      title: 'Senior Frontend Engineer',
      period: 'Mar 2021 – Present',
      bullets: [
        'Led a team of 5 engineers rebuilding the analytics dashboard in React and TypeScript',
        'Cut the largest bundle by 38% with route-level code splitting',
        'Introduced component tests that caught 40 regressions before release',
      ],
    },
    {
      company: 'Northwind Labs',
      title: 'Frontend Engineer',
      period: 'Jun 2018 – Feb 2021',
      bullets: [
        'Shipped a design system adopted by 6 product teams',
        'Improved Lighthouse accessibility scores from 71 to 96',
      ],
    },
  ],
  education: [
    {
      institution: 'State University',
      qualification: 'BSc Computer Science',
      period: '2011 – 2015',
    },
  ],
  skills: [
    { category: 'Languages', items: ['TypeScript', 'JavaScript', 'HTML', 'CSS'] },
    { category: 'Tools', items: ['React', 'GraphQL', 'Vite', 'Playwright'] },
  ],
};

const FULL_RESUME = `${DEMO_CONTACT.join('\n')}

Summary
Senior frontend engineer with seven years of experience building fast, accessible web applications for B2B products. I enjoy turning ambiguous product problems into simple interfaces, and I mentor engineers through code review and pairing.

Work Experience
Senior Frontend Engineer, Brightline Software — Mar 2021 – Present
- Led a team of 5 engineers rebuilding the analytics dashboard in React and TypeScript, used daily by 12,000 customers
- Cut the largest JavaScript bundle by 38% with route-level code splitting and a shared component cache
- Introduced component and end-to-end tests that caught 40 regressions before release and halved production hotfixes
- Partnered with design and product to ship 14 customer-requested features in two quarters
- Defined performance budgets in CI, so a change that slowed the main page by more than 5% failed review automatically
- Ran quarterly accessibility audits with a screen reader user and fixed all 31 issues they reported
Frontend Engineer, Northwind Labs — Jun 2018 – Feb 2021
- Built the design system adopted by 6 product teams, removing roughly 9,000 lines of duplicated interface code
- Improved Lighthouse accessibility scores from 71 to 96 across the marketing site and the customer app
- Migrated a 200,000 line codebase from JavaScript to TypeScript without pausing feature work
- Mentored 4 junior engineers, 3 of whom were promoted within 18 months
Web Developer, Pixel & Co — Aug 2015 – May 2018
- Delivered 25 client websites on a shared component library, reducing build time per site by 60%
- Automated image optimisation, lowering average page weight from 4 MB to 900 KB
- Ran weekly demos with clients and turned their feedback into prioritised tickets

Education
BSc Computer Science, State University — 2011 – 2015

Technical Skills
Languages: TypeScript, JavaScript, HTML, CSS
Frameworks and tools: React, Next.js, GraphQL, Vite, Playwright, Storybook
Practices: accessibility, performance budgets, code review, mentoring`;

const MID_RESUME = `${DEMO_CONTACT.join('\n')}

Professional Experience
Full Stack Developer, Harbor Systems — 2019 – Present
- Built internal tools in React and Node for the operations team
- Worked on the billing service and its reporting pages
- Helped the team move deployments to containers
Developer, Cedar Digital — 2016 – 2019
- Maintained customer websites and a booking platform
- Fixed bugs and wrote small features for the support team

Education
BSc Information Systems, Lakeside College — 2012 – 2016`;

const SYMBOL_RESUME = `${DEMO_CONTACT.join('\n')}

★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★
🚀 Staff Engineer 🚀 Platform & Commerce 💡 Open to relocate 🌍
★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★
☎ ✉ ☎ ✉ ☎ ✉ ☎ ✉ ☎ ✉ ☎ ✉

Experience
Staff Engineer, Marketlane — Jan 2020 – Present
- Designed the checkout platform handling 3 million orders a month
- Reduced p95 latency by 45% across 12 services
- Led the 2 year migration from a monolith to services
Senior Engineer, Cobalt Retail — 2015 – 2019
- Built the pricing engine used in 9 countries
- Introduced contract testing across 30 APIs

Education
MSc Software Engineering, Tech Institute — 2013 – 2015

Skills
Go, TypeScript, Kafka, PostgreSQL, Kubernetes`;

const THIN_RESUME = `Jamie Rivers
I am a developer who likes building products people enjoy using. I have worked on websites and a few mobile apps and I learn quickly. Please contact me by email at demo@example.com to discuss any opportunity.`;

export const resumes: SeedResume[] = [
  {
    company: 'Acme Corp',
    title: 'Frontend Resume (Acme)',
    text: FULL_RESUME,
    match: {
      score: 86,
      label: 'Good match',
      matchedKeywords: ['React', 'TypeScript', 'GraphQL', 'Accessibility', 'Design systems'],
      missingKeywords: ['Next.js SSR', 'Web performance monitoring'],
      summary:
        'Strong overlap on the core React and TypeScript stack, with leadership and accessibility experience that fits the role. The main gap is server-side rendering and production performance monitoring.',
    },
  },
  {
    company: 'Linear',
    title: 'Resume (generated for Linear)',
    ats: 'none',
    // Filled in by the step from GENERATED_RESUME, so the draft opens in the editor with headings and bullets.
    text: '',
    match: {
      score: 72,
      label: 'Good match',
      matchedKeywords: ['TypeScript', 'React', 'Performance'],
      missingKeywords: ['Realtime sync', 'Desktop apps', 'Keyboard-first design'],
      summary:
        'Good frontend fundamentals and measurable performance work. Linear looks for realtime and keyboard-driven product experience, which this resume does not show yet.',
    },
  },
  {
    company: 'Notion',
    title: 'Quick resume draft',
    text: THIN_RESUME,
    match: {
      score: 31,
      label: 'Needs work',
      matchedKeywords: ['Products'],
      missingKeywords: ['TypeScript', 'React', 'Collaboration', 'Product engineering', 'Realtime'],
      summary:
        'The resume says very little about the skills the role asks for. Add your stack, the products you shipped and what changed because of your work.',
    },
  },
  {
    company: 'TechCorp',
    title: 'Full Stack Resume',
    ats: 'stale',
    text: MID_RESUME,
    match: {
      score: 58,
      label: 'Some overlap',
      matchedKeywords: ['React', 'Node'],
      missingKeywords: ['PostgreSQL', 'SaaS', 'Testing'],
      summary: 'Relevant stack, but few results and no testing or database experience listed.',
      stale: true,
    },
  },
  {
    company: 'Shopify',
    title: 'Staff Engineer Resume',
    text: SYMBOL_RESUME,
    match: {
      score: 91,
      label: 'Excellent match',
      matchedKeywords: ['Commerce', 'Checkout', 'Kubernetes', 'Go', 'Latency'],
      missingKeywords: ['Ruby'],
      summary:
        'Checkout platform scale and a services migration line up closely with the role. Only Ruby is missing.',
    },
  },
  {
    // A draft with nothing in it: the ATS check reports it as not readable.
    company: 'Cloudflare',
    title: 'Resume (draft)',
    text: '',
  },
];
