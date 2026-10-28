import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { FeatureTrackingPage } from './-components/FeatureTrackingPage';

const TITLE = 'Application Tracking & Kanban Board — Trakwyn';
const DESCRIPTION =
  'Track every job application on a Kanban board or list, with notes, contacts, documents and reminders attached to each one.';

export const Route = createFileRoute('/features/tracking')({
  head: () => marketingHead({ path: '/features/tracking', title: TITLE, description: DESCRIPTION }),
  component: FeatureTrackingPage,
});
