import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeaturesIndexPage } from './-components/FeaturesIndexPage';

const TITLE = 'Features — Trakwyn';
const DESCRIPTION =
  'See what Trakwyn actually does: application tracking with a Kanban board, an AI assistant, AI resume & cover letter generation, and analytics — plus everything else that keeps a job search on track.';

export const Route = createFileRoute('/features/')({
  head: () => marketingHead({ path: '/features', title: TITLE, description: DESCRIPTION }),
  component: FeaturesIndexPage,
});
