import { createFileRoute } from '@tanstack/react-router';
import { marketingHead } from '#/lib/seo';
import { GuidesIndexPage } from './-components/GuidesIndexPage';

const TITLE = 'Guides — Trakwyn';
const DESCRIPTION =
  'Step-by-step guides for tracking job applications, tailoring cover letters and getting more out of Trakwyn.';

export const Route = createFileRoute('/guides/')({
  validateSearch: (search: Record<string, unknown>): { tag?: string } => ({
    tag: typeof search.tag === 'string' && search.tag ? search.tag : undefined,
  }),
  head: () => marketingHead({ path: '/guides', title: TITLE, description: DESCRIPTION }),
  component: GuidesIndexRoute,
});

function GuidesIndexRoute() {
  const { tag } = Route.useSearch();
  return <GuidesIndexPage tag={tag} />;
}
