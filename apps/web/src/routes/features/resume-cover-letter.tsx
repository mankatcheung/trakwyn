import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { heroPreloadLinks } from '../../features/marketing/pages/heroPreloads';
import { FeatureResumeCoverLetterPage } from '../../features/marketing/pages/FeatureResumeCoverLetterPage';

export const Route = createFileRoute('/features/resume-cover-letter')({
  head: ({ match }) =>
    marketingHead(
      { path: '/features/resume-cover-letter', seo: 'resumeCoverLetter' },
      match.context.pageLocale,
      heroPreloadLinks('resume'),
    ),
  component: FeatureResumeCoverLetterPage,
});
