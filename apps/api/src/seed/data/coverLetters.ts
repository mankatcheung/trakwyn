import type { SeedCoverLetter } from '../types.js';

interface LetterParts {
  company: string;
  role: string;
  why: string;
  proof: string;
}

const letter = ({ company, role, why, proof }: LetterParts): string => `Dear ${company} hiring team,

I am writing to apply for the ${role} role. ${why}

${proof}

I would welcome the chance to talk about how I can help your team, and I am happy to share code samples or walk through past projects.

Kind regards,
Demo User`;

export const coverLetters: SeedCoverLetter[] = [
  {
    company: 'Acme Corp',
    title: 'Cover letter (Acme)',
    text: letter({
      company: 'Acme Corp',
      role: 'Senior Frontend Engineer',
      why: 'Your dashboard is the product customers live in all day, and that is the kind of interface I most like to build.',
      proof:
        'At Brightline I led five engineers through a rebuild of an analytics dashboard in React and TypeScript, cutting the largest bundle by 38% while keeping accessibility scores above 95.',
    }),
  },
  {
    company: 'Notion',
    title: 'Cover letter (Notion)',
    text: letter({
      company: 'Notion',
      role: 'Product Engineer',
      why: 'I care about tools that make collaboration feel effortless, and Notion is the one my own team relies on.',
      proof:
        'I have shipped features end to end, from the first sketch to the metrics review, including a comments system that raised weekly active collaboration by 22%.',
    }),
  },
  {
    company: 'Shopify',
    title: 'Cover letter (Shopify)',
    text: letter({
      company: 'Shopify',
      role: 'Staff Engineer',
      why: 'Commerce infrastructure at your scale is where platform decisions matter most.',
      proof:
        'I designed a checkout platform handling three million orders a month and led its two year move from a monolith to services, reducing p95 latency by 45%.',
    }),
  },
  {
    company: 'Figma',
    title: 'Cover letter (Figma)',
    text: letter({
      company: 'Figma',
      role: 'Frontend Infrastructure Engineer',
      why: 'Rendering and collaboration in the browser is a hard problem, and the one I would most like to work on.',
      proof:
        'I built the design system used by six product teams and a build pipeline that cut CI time from 25 minutes to 9.',
    }),
  },
  {
    company: 'Datadog',
    title: 'Cover letter (Datadog)',
    text: letter({
      company: 'Datadog',
      role: 'Senior Backend Engineer',
      why: 'Observability sits at the centre of how teams ship safely, and I have relied on your platform in production.',
      proof:
        'I run a service processing 40 million events a day, and I introduced tracing that cut our mean time to resolve incidents from 90 to 35 minutes.',
    }),
  },
];
