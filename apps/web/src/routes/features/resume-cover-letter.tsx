import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeatureResumeCoverLetterPage } from './-components/FeatureResumeCoverLetterPage';

const TITLE = 'AI Resume & Cover Letter Generator — Trakwyn';
const DESCRIPTION =
  'Resume and cover letter drafts generated from your real work history and tailored to the job — grounded in what you actually entered, never invented.';

export const Route = createFileRoute('/features/resume-cover-letter')({
  head: () =>
    marketingHead({
      path: '/features/resume-cover-letter',
      title: TITLE,
      description: DESCRIPTION,
    }),
  component: FeatureResumeCoverLetterPage,
});
